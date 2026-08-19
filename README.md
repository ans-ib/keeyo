# Keeyo

A self-hosted tracker for your hardware security keys.

If you're anything like me, you probably bought a YubiKey, got a couple of Token2 keys a bit later, and now you have absolutely no idea which key holds which passkey or which one has your GitHub TOTP. Keeyo is a small, private web app I put together to fix this. It gives every physical key a digital card, so you can easily track what lives on each one. 

To be super clear upfront: **this app only stores names and notes**. It does not store any secrets, TOTP seeds, or private keys. All the sensitive stuff stays on your hardware keys where it belongs.

## What it does

*   **Visual inventory:** You get a grid showing all your keys. You can give them color tags, set the form factor (USB-C, nano, etc.), and mark them as active, backup, or lost.
*   **Auto-detects keys:** If you plug a key in and tap it, Keeyo reads its fingerprint via WebAuthn and automatically fills in the vendor and model. It pulls this from the official FIDO registry and community lists, which update automatically so new keys are recognized. If a key isn't in the registry, you just name it once and the app remembers it for next time. (Note: Because of browser WebAuthn rules, you have to serve the app over HTTPS or localhost for this to work). 
*   **Track what goes where:** Look at a specific key to see every passkey or 2FA code on it. You can also do a reverse lookup: pick a service and see exactly which keys give you access to it.
*   **Backup warnings:** The dashboard will give you a heads-up if a service only has one usable key attached to it, so you know where you need to register a spare.
*   **Lost key checklist:** If you lose a key, mark it as lost. Keeyo generates a checklist of every service that still trusts it and leaves a warning on your dashboard until you've revoked access everywhere.
*   **Locked notes:** You can store a secret note for a key (like its PIN), but set it up so the note only reveals itself if you physically tap that exact key. 
*   **App security:** You can protect your Keeyo account by requiring a hardware key tap along with your password to sign in.
*   **Health check-ins:** Backup keys tend to rot in drawers. Hit "Tested" whenever you confirm a key still works, and the dashboard will nudge you about any key that hasn't been checked in 6 months.
*   **Logbook:** Every key carries an append-only history — when it was registered, what was added or removed, status changes, tests. Like a real equipment ledger.
*   **Print it:** Print a physical asset tag for any key (with its number, barcode and a QR code back to its page) to stick on the keychain, or print the whole register as one inventory sheet. There's a CSV export too.
*   **Fast entry:** One-tap buttons for common services (GitHub, Google, ...), an "add another" mode for logging many services in a row, and deletes come with a 5-second Undo instead of nagging confirmations. Press `/` to search and `N` for a new key.
*   **Installable:** It's a PWA — add it to your phone's home screen and the register stays readable even offline.
*   **The basics:** It has built-in search, filtering and sorting, multi-user support, a dark mode, and a simple one-click JSON export for backups. 

## Getting started (Docker)

The easiest way to get it running is with Docker Compose. 

```bash
git clone https://github.com/ans-ib/keeyo.git && cd keeyo
docker compose up -d
```

Once it's up, open `http://localhost:5390`. You'll create the admin account on your first visit and can start adding keys. 

All your data lives in a single SQLite database in the `keeyo-data` volume. You can back it up by copying that volume, or just use the export button in the app settings.

### Without compose

```bash
docker build -t keeyo .
docker run -d --name keeyo -p 5390:5390 -v keeyo-data:/data --restart unless-stopped keeyo
```

### Running without Docker

If you don't want to use Docker, you just need Node.js 22.13 or newer. The app uses Node's built-in SQLite, so there are no messy native modules to deal with.

```bash
npm install
npm start
```

It will run on `http://localhost:5390`, and save the database to the `./data` folder.

## Configuration

You can tweak a few things using environment variables if you need to:

*   `PORT`: Changes the web server port (default is 5390).
*   `DATA_DIR`: Changes where the SQLite database is saved (default is `/data`).
*   `SESSION_TTL_DAYS`: How long you stay logged in (default is 30 days).
*   `REGISTRY_REFRESH_DAYS`: How often the app checks for new key models (default is 7 days).
*   `KEEYO_OFFLINE`: Set this to `1` if you want to block all external network requests, like the registry updates.
*   `TRUST_PROXY`: Set this to `1` if you are running behind a reverse proxy so rate limiting and HTTPS detection work correctly.
*   `KEEYO_DISABLE_MFA`: Set this to `1` if you ever get locked out and need to bypass the security key check at login.

Just a note on outbound traffic: the only thing the server reaches out to the internet for is the device registry list. It downloads the FIDO list, but doesn't verify the cryptographic signature on the file since we are just using it to get the display names of the keys, not for actual security decisions.

## Reverse proxy and HTTPS

Keeyo just runs plain HTTP. You are meant to put it behind a reverse proxy like Caddy, nginx, or Traefik to handle HTTPS. It automatically picks up standard proxy headers and secures the session cookies when it detects HTTPS.

Here is a quick example if you use Caddy:

```caddyfile
keys.example.com {
    reverse_proxy keeyo:5390
}
```

## A quick note on privacy

The app is built to be private. Passwords are hashed properly using scrypt, and sessions are kept strictly server-side.

The only optional feature that makes an outside network request is if you choose the "site favicon" setting for your services. That feature loads icons from DuckDuckGo directly in your browser. If you prefer zero external requests, just stick to the text-based letter avatars.

## Technical details

Under the hood, it is just Node.js, Express, and SQLite. The frontend is plain vanilla JavaScript with no complicated build steps, packed into one tiny container.

License: MIT
