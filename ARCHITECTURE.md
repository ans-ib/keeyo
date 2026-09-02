# Architecture

Keeyo is one Node.js process: a JSON API under `/api` and a static single-page app served from `public/`. There is no build step. Express is the only npm dependency; SQLite comes from Node's built-in `node:sqlite`.

## Layout

```
server/
  index.js          process entry: starts the registry refresh loop, listens
  app.js            createApp(): Express wiring and middleware order
  config.js         every environment variable, read once at startup
  db/               connection, schema.sql, additive column migrations
  lib/              framework-free helpers: validation, errors, scrypt,
                    WebAuthn verification, TOTP, single-use challenges
  middleware/       security headers, cross-site check, session guard, error handler
  auth/             sessions, users, sign-in throttling, second factors,
                    personal access tokens, SSO configuration, OIDC client
  inventory/        keys, services, registrations, catalog, attachments,
                    per-key event log, backup export/import, secret-note reveal
  registry/         FIDO device registry (community list + FIDO MDS), cached on disk
  routes/           one router per resource; parse the request, call the
                    domain module, send the response

public/
  index.html        loads css/ in cascade order and js/main.js as an ES module
  css/              one file per section; order is fixed by index.html
  js/main.js        entry: document-level listeners, service worker, boot
  js/router.js      hash routes, render, refresh
  js/state.js       in-memory state and selectors
  js/lib/           dom helpers, api client, WebAuthn, secret-note crypto
  js/ui/            shell, modal, toast, undo, key artwork, service icons
  js/views/         one file per page
  js/forms/         modals that create or edit records
  js/data/          built-in device catalog and AAGUID seed
  js/vendor/        qrcode.js (classic script, global `qrcode`)
  sw.js             precache list; VERSION is bumped on every release

test/
  helpers/          test server on a temp database, simulated WebAuthn
                    authenticator, independent TOTP implementation
  *.test.js         one file per area; each file starts its own server
```

## Request path

1. `securityHeaders` runs on every response.
2. Requests under `/api` pass `rejectCrossSite`, then `routes/index.js`.
3. `status`, `sign-in`, `sso` and `email` routers are mounted before `requireAuth`; every router after it can rely on `req.user`. A request may authenticate with the session cookie or an `Authorization: Bearer` access token; token requests carry `req.user.token`, are limited to their scope, and are refused on the session-only paths listed in `routes/index.js` and on the admin routes of the public routers.
4. Routers stay thin. Modules in `auth/` and `inventory/` validate input, run SQL, and write to the event log. Client-facing failures are thrown as `ApiError(status, message)` and turned into JSON by `middleware/error-handler.js`; anything else becomes a 500 with the stack on stderr.

## Data

- Schema lives in `server/db/schema.sql` and is applied with `IF NOT EXISTS` on every start.
- Columns added after a table first shipped are appended to `server/db/migrations.js`; entries are never edited or reordered.
- Every table that holds user data carries `user_id` with `ON DELETE CASCADE`; every query scopes by it.
- Secret notes are stored either as plain text or as an `enc:v1:` envelope the browser produced with the WebAuthn PRF extension. The server never decrypts an envelope.

## Front end

- Strict Content-Security-Policy: no inline scripts, no inline handlers. All behaviour is attached with `addEventListener`.
- Modules import each other directly. The cycle between `router.js` and the views is intentional; only function declarations cross it, so evaluation order does not matter.
- `lib/api.js` signals a lost session with a `keeyo:signed-out` event instead of importing the router.
- Layout is a fixed icon rail (`ui/shell.js`) beside the page; on narrow screens the rail becomes a bottom bar. Settings is a two-column page: grouped nav on the left, stacked sections on the right.
- Theme is light, dark or system, chosen from the rail's account menu and stored as `keeyo-theme`. `css/tokens.css` holds both palettes; `js/theme-init.js` applies the stored choice before first paint.
- Stylesheet order in `index.html`: fonts, tokens, layout, components, overlays, then one file per page area, then print and motion.
- Adding a static file means adding it to `SHELL` in `public/sw.js` and, for modules, a `modulepreload` link in `index.html`.
