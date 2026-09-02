'use strict';

const crypto = require('node:crypto');
const { ApiError } = require('./errors');

const ALGORITHMS = [-7, -257, -8];

const CREDENTIAL_ID_RE = /^[A-Za-z0-9_-]+$/;
const SPKI_B64_RE = /^[A-Za-z0-9+/=]+$/;

function isCredentialId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && CREDENTIAL_ID_RE.test(value);
}

function isSpkiBase64(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4000 && SPKI_B64_RE.test(value);
}

function isSupportedAlgorithm(alg) {
  return ALGORITHMS.includes(Number(alg));
}

function spkiToPem(b64) {
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function parseCredential(input) {
  if (!input || typeof input !== 'object') return null;
  const publicKey = typeof input.publicKey === 'string' ? input.publicKey.replace(/\s+/g, '') : '';
  if (!isCredentialId(input.id) || !isSpkiBase64(publicKey) || !isSupportedAlgorithm(input.alg)) return null;
  return {
    id: input.id,
    publicKeyPem: spkiToPem(publicKey),
    alg: Number(input.alg),
    prfEnabled: input.prfEnabled ? 1 : 0,
  };
}

function verifyClientData(raw, { type, challenge, hostname }) {
  let clientData;
  try {
    clientData = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ApiError(400, 'Malformed assertion');
  }
  if (clientData.type !== type) throw new ApiError(403, 'Wrong ceremony type');
  if (clientData.challenge !== challenge) throw new ApiError(403, 'Challenge mismatch');
  let originHost = '';
  try { originHost = new URL(clientData.origin).hostname; } catch {  }
  if (!originHost || originHost !== hostname) {
    throw new ApiError(403, `Origin mismatch — assertion came from "${originHost || '?'}", expected "${hostname}"`);
  }
  return clientData;
}

function verifyAssertion({ hostname, credential, challenge, body }) {
  const clientDataRaw = Buffer.from(String(body.clientDataJSON || ''), 'base64url');
  verifyClientData(clientDataRaw, { type: 'webauthn.get', challenge, hostname });

  const authData = Buffer.from(String(body.authenticatorData || ''), 'base64url');
  const signature = Buffer.from(String(body.signature || ''), 'base64url');
  if (authData.length < 37 || signature.length === 0) throw new ApiError(400, 'Malformed assertion');

  const rpIdHash = crypto.createHash('sha256').update(hostname).digest();
  if (!rpIdHash.equals(authData.subarray(0, 32))) throw new ApiError(403, 'RP ID mismatch');
  if (!(authData[32] & 0x01)) throw new ApiError(403, 'User presence was not asserted');

  const signed = Buffer.concat([authData, crypto.createHash('sha256').update(clientDataRaw).digest()]);
  let ok = false;
  try {
    ok = crypto.verify(credential.alg === -8 ? null : 'sha256', signed, credential.publicKeyPem, signature);
  } catch {
    ok = false;
  }
  if (!ok) throw new ApiError(403, 'Signature check failed — that is not the paired key');
}

module.exports = {
  ALGORITHMS,
  isCredentialId,
  isSpkiBase64,
  isSupportedAlgorithm,
  spkiToPem,
  parseCredential,
  verifyClientData,
  verifyAssertion,
};
