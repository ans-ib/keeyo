import { api } from './api.js';
import { b64urlToBuf, bufToB64url } from './dom.js';

const isEncryptedNote = (s) => typeof s === 'string' && s.startsWith('enc:v1:');

async function deriveNoteKey(prfOutput, saltBytes) {
  const hkdf = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: new TextEncoder().encode('keeyo-secret-note-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptNote(plaintext, prfOutput, saltBytes) {
  const key = await deriveNoteKey(prfOutput, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  return `enc:v1:${bufToB64url(saltBytes)}:${bufToB64url(iv)}:${bufToB64url(ct)}`;
}

async function decryptNote(envelope, prfOutput) {
  const parts = envelope.split(':');
  const key = await deriveNoteKey(prfOutput, b64urlToBuf(parts[2]));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlToBuf(parts[3]) }, key, b64urlToBuf(parts[4]));
  return new TextDecoder().decode(plain);
}

export async function derivePrfForKey(credentialId, saltBytes) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: b64urlToBuf(credentialId) }],
      userVerification: 'discouraged',
      extensions: { prf: { eval: { first: saltBytes } } },
      timeout: 60000,
    },
  });
  const out = assertion.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new Error('This key or browser could not derive the encryption secret (PRF)');
  return new Uint8Array(out);
}

export async function revealSecret(key) {
  const ch = await api(`/keys/${key.id}/reveal-challenge`, { method: 'POST', body: {} });
  const publicKey = {
    challenge: b64urlToBuf(ch.challenge),
    allowCredentials: [{ type: 'public-key', id: b64urlToBuf(key.credentialId) }],
    userVerification: 'discouraged',
    timeout: 60000,
  };
  if (ch.prfSalt) publicKey.extensions = { prf: { eval: { first: b64urlToBuf(ch.prfSalt) } } };
  const assertion = await navigator.credentials.get({ publicKey });
  const r = assertion.response;
  const out = await api(`/keys/${key.id}/reveal`, {
    method: 'POST',
    body: {
      token: ch.token,
      credentialId: assertion.id,
      clientDataJSON: bufToB64url(r.clientDataJSON),
      authenticatorData: bufToB64url(r.authenticatorData),
      signature: bufToB64url(r.signature),
    },
  });
  if (isEncryptedNote(out.secret)) {
    const prfOut = assertion.getClientExtensionResults().prf?.results?.first;
    if (!prfOut) throw new Error('The browser could not derive the decryption secret from this key');
    return decryptNote(out.secret, new Uint8Array(prfOut));
  }
  return out.secret;
}
