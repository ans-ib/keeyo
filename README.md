# Keeyo

**Self-hosted inventory for your hardware security keys.**

You bought two YubiKeys, then a couple of Token2 keys arrived — and now you can't remember which key holds the passkey for which service, or which one stores the GitHub TOTP. Keeyo fixes that: a small, private web app where every physical key gets a card, and every card lists exactly what lives on it.

Keeyo stores **names and notes only** — no secrets, no TOTP seeds, no private keys. Everything sensitive stays on your hardware keys where it belongs.

## Features

- 🔑 **Key grid** — every physical key as a card with its own color tag, model artwork (USB-A / USB-C / nano / dual / card) and status (active, backup, lost, retired)
- 📡 **Detect my key** — plug the key in, touch it, and Keeyo reads its model fingerprint (AAGUID) via WebAuthn and fills in vendor/model/form factor. Identification uses a **live device registry**: the server periodically fetches the [FIDO Alliance Metadata Service](https://fidoalliance.org/metadata/) (the official registry vendors publish every certified authenticator to) plus the [community passkey registry](https://github.com/passkeydeveloper/passkey-authenticator-aaguids), so newly released keys are recognized without updating Keeyo. Anything not in either registry is *learned*: name it once and the next identical key is recognized instantly. Nothing is written to the key and none of its storage is used. Requires the page to be served from `localhost` or HTTPS (a WebAuthn rule — raw IP addresses won't work).
- 🗂 **Per-key detail** — see every passkey, 2FA registration and TOTP code tracked on a key
- 🧭 **Service directory** (Settings → Services) — the reverse lookup: pick a service, see which keys cover it
- ⚠️ **Backup warnings** — services covered by only one usable key (or none) are flagged on your dashboard, so you know where you need to register a spare
- 📇 **Model catalog** — built-in list of common Yubico, Token2, Google Titan, Nitrokey, SoloKeys and Feitian models with form factor, NFC and slot capacities (e.g. "12 / 25 passkey slots tracked")
- 🔍 **Search** — type a service name on the Keys page to instantly see which key has it
- 🎨 **Icons** — automatic letter avatars, emoji, or site favicons for services
- 👥 **Multi-user** — each user gets a private inventory; the admin manages accounts
- 💾 **Backup** — one-click JSON export / import
- 🌙 Dark and light themes, fully responsive

## Quick start (Docker)

```bash
git clone https://github.com/ans-ib/keeyo.git && cd keeyo
docker compose up -d
```

Open `http://localhost:5390`, create the admin account on first run, and start adding keys.

Data lives in the `keeyo-data` volume (a single SQLite database). Back it up by copying the volume or using **Settings → Export data**.

### Without compose

```bash
docker build -t keeyo .
docker run -d --name keeyo -p 5390:5390 -v keeyo-data:/data --restart unless-stopped keeyo
```

### Without Docker

Requires Node.js **22.13+** (uses the built-in `node:sqlite` — no native modules).

```bash
npm install
npm start           # http://localhost:5390, data in ./data
```

## Configuration

| Env var                 | Default | Description                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------ |
| `PORT`                  | `5390`  | HTTP port                                                           |
| `DATA_DIR`              | `/data` | Where the SQLite database is stored                                 |
| `SESSION_TTL_DAYS`      | `30`    | How long sign-in sessions last                                      |
| `REGISTRY_REFRESH_DAYS` | `7`     | How often the device registry is re-fetched                        |
| `KEEYO_OFFLINE`         | unset   | Set to `1` to disable all outbound requests (registry updates off) |

The device registry is the server's only outbound traffic (two fetches per refresh). The FIDO MDS blob is a signed JWT; Keeyo decodes it without verifying the signature since the data only names devices in the UI and is never used for security decisions.

## Reverse proxy / HTTPS

Keeyo speaks plain HTTP and is meant to sit behind your reverse proxy (Caddy, Traefik, nginx, …) for TLS. It honors `X-Forwarded-Proto` and marks session cookies `Secure` automatically when served over HTTPS.

```caddyfile
keys.example.com {
    reverse_proxy keeyo:5390
}
```

## Notes on privacy

- The only optional external request is the **site favicon** icon mode, which loads icons in *your browser* from `icons.duckduckgo.com`. Use the letter or emoji icon modes if you want zero external requests.
- Passwords are hashed with scrypt; sessions are server-side tokens in httpOnly cookies.

## Tech

Node.js + Express + SQLite (via the built-in `node:sqlite`), vanilla JS frontend, zero build step, one tiny container.

## License

MIT
