'use strict';

// Catalog of common hardware security keys. passkeySlots / totpSlots are the
// number of credentials the hardware can store (null = unknown, 0 = not supported).
window.KEEYO_CATALOG = {
  vendors: [
    {
      id: 'Yubico',
      name: 'Yubico',
      models: [
        { name: 'YubiKey 5 NFC', formFactor: 'usb-a', nfc: true, passkeySlots: 25, totpSlots: 32, note: '100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey 5C NFC', formFactor: 'usb-c', nfc: true, passkeySlots: 25, totpSlots: 32, note: '100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey 5C', formFactor: 'usb-c', nfc: false, passkeySlots: 25, totpSlots: 32, note: '100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey 5 Nano', formFactor: 'nano-a', nfc: false, passkeySlots: 25, totpSlots: 32, note: '100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey 5C Nano', formFactor: 'nano-c', nfc: false, passkeySlots: 25, totpSlots: 32, note: '100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey 5Ci', formFactor: 'dual', nfc: false, passkeySlots: 25, totpSlots: 32, note: 'USB-C + Lightning. 100 passkeys / 64 TOTP on firmware 5.7+' },
        { name: 'YubiKey Bio (FIDO Edition)', formFactor: 'usb-a', nfc: false, passkeySlots: 25, totpSlots: 0, note: 'Fingerprint. FIDO only — no TOTP storage' },
        { name: 'YubiKey C Bio (FIDO Edition)', formFactor: 'usb-c', nfc: false, passkeySlots: 25, totpSlots: 0, note: 'Fingerprint. FIDO only — no TOTP storage' },
        { name: 'Security Key NFC', formFactor: 'usb-a', nfc: true, passkeySlots: 25, totpSlots: 0, note: 'FIDO only — no TOTP storage. 100 passkeys on firmware 5.7+' },
        { name: 'Security Key C NFC', formFactor: 'usb-c', nfc: true, passkeySlots: 25, totpSlots: 0, note: 'FIDO only — no TOTP storage. 100 passkeys on firmware 5.7+' },
        { name: 'YubiKey 4 / NEO (legacy)', formFactor: 'usb-a', nfc: false, passkeySlots: null, totpSlots: 28, note: 'No FIDO2 resident keys on YubiKey 4' },
      ],
    },
    {
      id: 'Token2',
      name: 'Token2',
      models: [
        { name: 'PIN+ Release2 (USB-A NFC)', formFactor: 'usb-a', nfc: true, passkeySlots: 300, totpSlots: 0, note: 'FIDO2.1 PIN+ series' },
        { name: 'PIN+ Release2 (USB-C NFC)', formFactor: 'usb-c', nfc: true, passkeySlots: 300, totpSlots: 0, note: 'FIDO2.1 PIN+ series' },
        { name: 'T2F2 PIN+ TypeC', formFactor: 'usb-c', nfc: true, passkeySlots: 128, totpSlots: 0, note: '' },
        { name: 'T2F2-NFC', formFactor: 'usb-a', nfc: true, passkeySlots: 50, totpSlots: 0, note: '' },
        { name: 'T2F2-Bio (fingerprint)', formFactor: 'usb-a', nfc: true, passkeySlots: 50, totpSlots: 0, note: 'Fingerprint' },
        { name: 'T2F2 Dual (USB-A + USB-C)', formFactor: 'dual', nfc: true, passkeySlots: 50, totpSlots: 0, note: '' },
        { name: 'OTPC / miniOTP card', formFactor: 'card', nfc: true, passkeySlots: 0, totpSlots: 1, note: 'TOTP display card' },
      ],
    },
    {
      id: 'Google',
      name: 'Google',
      models: [
        { name: 'Titan Security Key (USB-A/NFC)', formFactor: 'usb-a', nfc: true, passkeySlots: 250, totpSlots: 0, note: 'FIDO only — no TOTP storage' },
        { name: 'Titan Security Key (USB-C/NFC)', formFactor: 'usb-c', nfc: true, passkeySlots: 250, totpSlots: 0, note: 'FIDO only — no TOTP storage' },
      ],
    },
    {
      id: 'Nitrokey',
      name: 'Nitrokey',
      models: [
        { name: 'Nitrokey 3A NFC', formFactor: 'usb-a', nfc: true, passkeySlots: null, totpSlots: null, note: 'Open source' },
        { name: 'Nitrokey 3C NFC', formFactor: 'usb-c', nfc: true, passkeySlots: null, totpSlots: null, note: 'Open source' },
        { name: 'Nitrokey Passkey', formFactor: 'usb-a', nfc: false, passkeySlots: null, totpSlots: 0, note: 'FIDO2 only' },
      ],
    },
    {
      id: 'SoloKeys',
      name: 'SoloKeys',
      models: [
        { name: 'Solo 2 A+ (USB-A NFC)', formFactor: 'usb-a', nfc: true, passkeySlots: null, totpSlots: 0, note: 'Open source' },
        { name: 'Solo 2 C+ (USB-C NFC)', formFactor: 'usb-c', nfc: true, passkeySlots: null, totpSlots: 0, note: 'Open source' },
      ],
    },
    {
      id: 'Feitian',
      name: 'Feitian',
      models: [
        { name: 'ePass K9 (USB-A NFC)', formFactor: 'usb-a', nfc: true, passkeySlots: null, totpSlots: null, note: '' },
        { name: 'ePass K40 (USB-C NFC)', formFactor: 'usb-c', nfc: true, passkeySlots: null, totpSlots: null, note: '' },
        { name: 'BioPass K26/K27', formFactor: 'usb-c', nfc: false, passkeySlots: null, totpSlots: null, note: 'Fingerprint' },
      ],
    },
    {
      id: 'Other',
      name: 'Other',
      models: [],
    },
  ],

  formFactors: [
    { id: 'usb-a', name: 'USB-A' },
    { id: 'usb-c', name: 'USB-C' },
    { id: 'nano-a', name: 'USB-A Nano' },
    { id: 'nano-c', name: 'USB-C Nano' },
    { id: 'dual', name: 'Dual connector' },
    { id: 'card', name: 'Card' },
    { id: 'other', name: 'Other' },
  ],

  totpApps: [
    'Yubico Authenticator',
    'Token2 TOTP+ app',
    'Nitrokey App',
    'Google Authenticator',
    'Microsoft Authenticator',
    'Aegis',
    '2FAS',
    'Ente Auth',
    'Authy',
    'Bitwarden',
    '1Password',
  ],
};

window.KEEYO_CATALOG.findModel = function findModel(vendor, modelName) {
  const v = window.KEEYO_CATALOG.vendors.find((x) => x.id === vendor);
  if (!v) return null;
  return v.models.find((m) => m.name === modelName) || null;
};
