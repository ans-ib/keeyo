'use strict';

// OFFLINE SEED for the "Detect my key" feature.
//
// The primary source is the server's live device registry (FIDO Alliance MDS +
// the community passkey registry), which auto-refreshes — see server/mds.js.
// This file is only the fallback when that registry is unreachable (fresh
// install without internet, KEEYO_OFFLINE, …).
//
// An AAGUID identifies an authenticator *series*, not an exact SKU — e.g. the
// YubiKey 5 NFC and 5C NFC share one AAGUID, so `models` can list several
// candidates (the UI then asks which variant it is). Model names must match
// entries in models.js.

window.KEEYO_AAGUIDS = {
  'ee882879-721c-4913-9775-3dfcce97072a': {
    vendor: 'Yubico', label: 'YubiKey 5 Series',
    models: ['YubiKey 5C', 'YubiKey 5 Nano', 'YubiKey 5C Nano'],
  },
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': {
    vendor: 'Yubico', label: 'YubiKey 5 Series',
    models: ['YubiKey 5C', 'YubiKey 5 Nano', 'YubiKey 5C Nano'],
  },
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': {
    vendor: 'Yubico', label: 'YubiKey 5 Series with NFC',
    models: ['YubiKey 5 NFC', 'YubiKey 5C NFC'],
  },
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': {
    vendor: 'Yubico', label: 'YubiKey 5 Series with NFC',
    models: ['YubiKey 5 NFC', 'YubiKey 5C NFC'],
  },
  'c5ef55ff-ad9a-4b9f-b580-adebafe026d0': {
    vendor: 'Yubico', label: 'YubiKey 5Ci',
    models: ['YubiKey 5Ci'],
  },
  '85203421-48f9-4355-9bc8-8a53846e5083': {
    vendor: 'Yubico', label: 'YubiKey 5Ci FIPS',
    models: ['YubiKey 5Ci'],
  },
  'd8522d9f-575b-4866-88a9-ba99fa02f35b': {
    vendor: 'Yubico', label: 'YubiKey Bio Series',
    models: ['YubiKey Bio (FIDO Edition)', 'YubiKey C Bio (FIDO Edition)'],
  },
  '83c47309-aabb-4108-8470-8be838b573cb': {
    vendor: 'Yubico', label: 'YubiKey Bio Series (Enterprise Profile)',
    models: ['YubiKey Bio (FIDO Edition)', 'YubiKey C Bio (FIDO Edition)'],
  },
  'f8a011f3-8c0a-4d15-8006-17111f9edc7d': {
    vendor: 'Yubico', label: 'Security Key by Yubico',
    models: [],
  },
  'b92c3f9a-c014-4056-887f-140a2501163b': {
    vendor: 'Yubico', label: 'Security Key by Yubico',
    models: [],
  },
  '6d44ba9b-f6ec-2e49-b930-0c8fe920cb73': {
    vendor: 'Yubico', label: 'Security Key by Yubico with NFC',
    models: ['Security Key NFC', 'Security Key C NFC'],
  },
  '149a2021-8ef6-4133-96b8-81f8d5b7f1f5': {
    vendor: 'Yubico', label: 'Security Key by Yubico with NFC',
    models: ['Security Key NFC', 'Security Key C NFC'],
  },
  'a4e9fc6d-4cbe-4758-b8ba-37598bb5bbaa': {
    vendor: 'Yubico', label: 'Security Key NFC by Yubico',
    models: ['Security Key NFC', 'Security Key C NFC'],
  },
  '0bb43545-fd2c-4185-87dd-feb0b2916ace': {
    vendor: 'Yubico', label: 'Security Key NFC — Enterprise Edition',
    models: ['Security Key NFC', 'Security Key C NFC'],
  },
  '73bb0cd4-e502-49b8-9c6f-b59445bf720b': {
    vendor: 'Yubico', label: 'YubiKey 5 FIPS Series',
    models: ['YubiKey 5C', 'YubiKey 5 Nano', 'YubiKey 5C Nano'],
  },
  'c1f9a0bc-1dd2-404a-b27f-8e29047a43fd': {
    vendor: 'Yubico', label: 'YubiKey 5 FIPS Series with NFC',
    models: ['YubiKey 5 NFC', 'YubiKey 5C NFC'],
  },
};
