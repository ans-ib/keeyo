# Contributing

## Running it locally

```
npm install
npm start          # http://localhost:5390, data in ./data
npm run dev        # same, restarts when server/ changes
npm test           # API suite on node:test, nothing to install
```

Node 22.13 or newer is required (`.nvmrc`). `DATA_DIR` and `PORT` override the defaults; the full list of environment variables is in `server/config.js`.

## Ground rules

- Express stays the only runtime dependency. Reach for Node built-ins first.
- No inline scripts or handlers in `public/`; the Content-Security-Policy forbids them.
- Every API change comes with a test in the matching `test/*.test.js`. Each test file runs against its own server and database, so tests never depend on each other across files.
- Server code: validation, SQL and event logging live in `server/auth/` and `server/inventory/`; routers only translate HTTP. Client-facing errors are `ApiError`s.
- Schema: new tables go in `server/db/schema.sql`, new columns are appended to `server/db/migrations.js`.
- Front end: a new page is a file in `public/js/views/`, a new dialog a file in `public/js/forms/`. Use the tokens in `public/css/tokens.css` for every colour so both themes stay correct. Register new static files in `public/sw.js` and `public/index.html`.
- Keep `README.md` in the maintainer's voice; edit it surgically.

## Device catalog

Add hardware to `public/js/data/models.js`. If you know the model's AAGUID, add it to `public/js/data/aaguids.js` as well so "Detect my key" recognises it offline.

## Releases

Maintainer only: bump `package.json` (`npm install --package-lock-only`), bump `VERSION` in `public/sw.js`, tag `vX.Y.Z`. CI publishes the multi-arch image to `ghcr.io/ans-ib/keeyo` on the tag.
