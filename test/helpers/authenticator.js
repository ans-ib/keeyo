'use strict';

const crypto = require('node:crypto');

function makeAuthenticator() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    credentialId: crypto.randomBytes(32).toString('base64url'),
    spkiB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey,
  };
}

function authDataFor(hostname, { up = true } = {}) {
  const rpIdHash = crypto.createHash('sha256').update(hostname).digest();
  return Buffer.concat([rpIdHash, Buffer.from([up ? 0x01 : 0x00]), Buffer.alloc(4)]);
}

function webauthnFor(server) {
  return {
    makeAuthenticator,

    signAssertion(authr, challenge, { up = true, origin = null, wrongKey = false } = {}) {
      const clientData = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: origin || server.base,
      }));
      const authData = authDataFor(server.hostname, { up });
      const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientData).digest()]);
      const key = wrongKey ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey : authr.privateKey;
      return {
        credentialId: authr.credentialId,
        clientDataJSON: clientData.toString('base64url'),
        authenticatorData: authData.toString('base64url'),
        signature: crypto.sign('sha256', signed, key).toString('base64url'),
      };
    },

    creationClientData(challenge, origin = null) {
      return Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: origin || server.base }))
        .toString('base64url');
    },
  };
}

module.exports = { makeAuthenticator, webauthnFor };
