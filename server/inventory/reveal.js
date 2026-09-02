'use strict';

const { ApiError } = require('../lib/errors');
const challenges = require('../lib/challenges');
const webauthn = require('../lib/webauthn');
const keys = require('./keys');
const secretNotes = require('./secret-notes');

function begin(userId, keyId) {
  const key = keys.pairing(userId, keyId);
  if (!key.credentialId) throw new ApiError(400, 'This key was not paired by scanning — no possession proof is available');
  if (!key.secret) throw new ApiError(400, 'No secret note is stored on this key');
  const prfSalt = secretNotes.prfSalt(key.secret);
  return { ...challenges.issue('reveal', { userId, keyId }), encrypted: !!prfSalt, prfSalt };
}

function complete(userId, keyId, body, hostname) {
  const entry = challenges.consume(body.token, 'reveal');
  if (entry.userId !== userId || entry.keyId !== keyId) throw new ApiError(400, 'Challenge expired — try again');
  const key = keys.pairing(userId, keyId);
  if (!key.credentialId || !key.publicKeyPem) throw new ApiError(400, 'No paired credential on this key');
  if (String(body.credentialId || '') !== key.credentialId) throw new ApiError(403, 'That is not the paired key');
  webauthn.verifyAssertion({ hostname, credential: key, challenge: entry.challenge, body });
  return key.secret;
}

module.exports = { begin, complete };
