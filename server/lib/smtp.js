'use strict';

const net = require('node:net');
const tls = require('node:tls');

const TIMEOUT_MS = 15000;

function attachReader(socket, state) {
  state.buffer = '';
  state.pendingLines = [];
  state.queue = [];
  state.waiters = [];
  socket.on('data', (chunk) => {
    state.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = state.buffer.indexOf('\r\n')) !== -1) {
      const line = state.buffer.slice(0, idx);
      state.buffer = state.buffer.slice(idx + 2);
      state.pendingLines.push(line);
      if (line.length >= 4 ? line[3] === ' ' : true) {
        const reply = { code: Number(line.slice(0, 3)), text: state.pendingLines.join('\n') };
        state.pendingLines = [];
        const waiter = state.waiters.shift();
        if (waiter) waiter.resolve(reply);
        else state.queue.push(reply);
      }
    }
  });
}

function makeConnection(socket) {
  const state = {};
  attachReader(socket, state);
  let failed = null;
  const failWaiters = (err) => {
    failed = err;
    for (const w of state.waiters.splice(0)) w.reject(err);
  };
  socket.setTimeout(TIMEOUT_MS, () => {
    failWaiters(new Error('SMTP connection timed out'));
    socket.destroy();
  });
  socket.on('error', (err) => failWaiters(err));
  socket.on('close', () => failWaiters(new Error('SMTP connection closed unexpectedly')));
  return {
    socket,
    read() {
      if (state.queue.length) return Promise.resolve(state.queue.shift());
      if (failed) return Promise.reject(failed);
      return new Promise((resolve, reject) => state.waiters.push({ resolve, reject }));
    },
    write(text) {
      socket.write(text + '\r\n');
    },
  };
}

async function expect(conn, allowed, sent) {
  const reply = await conn.read();
  if (!allowed.includes(reply.code)) {
    throw new Error(`SMTP ${sent} failed: ${reply.text.split('\n')[0]}`);
  }
  return reply;
}

async function command(conn, line, allowed, label) {
  conn.write(line);
  return expect(conn, allowed, label || line.split(' ')[0]);
}

function openSocket(cfg) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    if (cfg.security === 'tls') {
      const socket = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => {
        socket.removeListener('error', onError);
        resolve(socket);
      });
      socket.once('error', onError);
    } else {
      const socket = net.connect({ host: cfg.host, port: cfg.port }, () => {
        socket.removeListener('error', onError);
        resolve(socket);
      });
      socket.once('error', onError);
    }
  });
}

function upgradeSocket(cfg, socket) {
  return new Promise((resolve, reject) => {
    const upgraded = tls.connect({ socket, servername: cfg.host }, () => {
      upgraded.removeListener('error', reject);
      resolve(upgraded);
    });
    upgraded.once('error', reject);
  });
}

function dotStuff(text) {
  return text.split('\n').map((l) => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
}

function buildMessage(cfg, mail) {
  const fromHeader = cfg.fromName ? `${cfg.fromName.replace(/[<>\r\n"]/g, '')} <${cfg.from}>` : cfg.from;
  const id = `${Date.now()}.${Math.random().toString(36).slice(2)}@${cfg.host}`;
  return [
    `From: ${fromHeader}`,
    `To: <${mail.to}>`,
    `Subject: ${mail.subject.replace(/[\r\n]/g, ' ')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    dotStuff(mail.text),
  ].join('\r\n');
}

async function send(cfg, mail) {
  const rawSocket = await openSocket(cfg);
  let conn = makeConnection(rawSocket);
  try {
    await expect(conn, [220], 'greeting');
    let ehlo = await command(conn, 'EHLO keeyo', [250], 'EHLO');
    if (cfg.security === 'starttls') {
      await command(conn, 'STARTTLS', [220]);
      const upgraded = await upgradeSocket(cfg, conn.socket);
      conn = makeConnection(upgraded);
      ehlo = await command(conn, 'EHLO keeyo', [250], 'EHLO');
    }
    if (cfg.user) {
      const plain = Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`).toString('base64');
      if (/AUTH[ =][^\n]*PLAIN/i.test(ehlo.text)) {
        await command(conn, `AUTH PLAIN ${plain}`, [235], 'AUTH');
      } else {
        await command(conn, 'AUTH LOGIN', [334], 'AUTH');
        await command(conn, Buffer.from(cfg.user).toString('base64'), [334], 'AUTH username');
        await command(conn, Buffer.from(cfg.pass).toString('base64'), [235], 'AUTH password');
      }
    }
    await command(conn, `MAIL FROM:<${cfg.from}>`, [250], 'MAIL FROM');
    await command(conn, `RCPT TO:<${mail.to}>`, [250, 251], 'RCPT TO');
    await command(conn, 'DATA', [354]);
    conn.write(buildMessage(cfg, mail) + '\r\n.');
    await expect(conn, [250], 'message body');
    conn.write('QUIT');
  } finally {
    conn.socket.end();
    conn.socket.unref();
  }
}

module.exports = { send };
