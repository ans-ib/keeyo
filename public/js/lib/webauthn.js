import { state } from '../state.js';
import { b64urlToBuf, bufToB64 } from './dom.js';

function cborDecode(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  function read() {
    const ib = dv.getUint8(p++);
    const mt = ib >> 5;
    const ai = ib & 31;
    let len;
    if (ai < 24) len = ai;
    else if (ai === 24) { len = dv.getUint8(p); p += 1; }
    else if (ai === 25) { len = dv.getUint16(p); p += 2; }
    else if (ai === 26) { len = dv.getUint32(p); p += 4; }
    else if (ai === 27) { len = Number(dv.getBigUint64(p)); p += 8; }
    else throw new Error('Unsupported CBOR');
    switch (mt) {
      case 0: return len;
      case 1: return -1 - len;
      case 2: { const v = bytes.slice(p, p + len); p += len; return v; }
      case 3: { const v = new TextDecoder().decode(bytes.slice(p, p + len)); p += len; return v; }
      case 4: { const a = []; for (let i = 0; i < len; i++) a.push(read()); return a; }
      case 5: { const o = {}; for (let i = 0; i < len; i++) { const k = read(); o[k] = read(); } return o; }
      case 6: return read();
      default:
        if (ai === 20) return false;
        if (ai === 21) return true;
        return null;
    }
  }
  return read();
}

export const ZERO_AAGUID = '00000000-0000-0000-0000-000000000000';

export async function detectKey(signal) {
  if (!window.isSecureContext || !window.PublicKeyCredential) {
    throw new Error('Key detection needs HTTPS or localhost — this page was opened another way.');
  }
  const publicKey = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Keeyo' },
    user: {
      id: crypto.getRandomValues(new Uint8Array(16)),
      name: 'keeyo-detect',
      displayName: 'Keeyo key detection',
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: {
      authenticatorAttachment: 'cross-platform',
      residentKey: 'discouraged',
      userVerification: 'discouraged',
    },
    attestation: 'direct',
    extensions: { prf: {} },
    timeout: 60000,
  };
  const cred = await navigator.credentials.create({ publicKey, signal });
  const resp = cred.response;
  let authData;
  if (typeof resp.getAuthenticatorData === 'function') {
    authData = new Uint8Array(resp.getAuthenticatorData());
  } else {
    authData = cborDecode(new Uint8Array(resp.attestationObject)).authData;
  }
  if (!authData || authData.length < 53) throw new Error('The key did not return identification data.');
  const aaguid = [...authData.slice(37, 53)].map((b, i) =>
    ((i === 4 || i === 6 || i === 8 || i === 10) ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
  const transports = typeof resp.getTransports === 'function' ? resp.getTransports() : [];
  let credential = null;
  try {
    const spki = typeof resp.getPublicKey === 'function' ? resp.getPublicKey() : null;
    if (spki) {
      let prfEnabled = false;
      try { prfEnabled = cred.getClientExtensionResults().prf?.enabled === true; } catch {}
      credential = {
        id: cred.id,
        publicKey: bufToB64(spki),
        alg: typeof resp.getPublicKeyAlgorithm === 'function' ? resp.getPublicKeyAlgorithm() : -7,
        prfEnabled,
      };
    }
  } catch {}
  return { aaguid, transports, credential };
}

export async function identifyAssertion(signal) {
  const paired = state.keys.filter((k) => k.credentialId);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: paired.map((k) => ({ type: 'public-key', id: b64urlToBuf(k.credentialId) })),
      userVerification: 'discouraged',
      timeout: 60000,
    },
    signal,
  });
  return paired.find((k) => k.credentialId === assertion.id) || null;
}
