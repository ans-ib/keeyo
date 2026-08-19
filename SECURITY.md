# Security Policy

I take security seriously. If you discover a vulnerability in this hardware inventory app, please report it responsibly so it can be fixed before public disclosure.

## Supported Versions

Only the latest `latest` Docker image / main branch receives security updates.

## How to Report a Vulnerability

Please **do not** open a public GitHub issue.

Instead, please use the GitHub Security Advisory **"Report a Vulnerability"** tab on this repository. I will review your report and keep you updated on the patch progress.

## What makes a helpful report

To help me fix the issue quickly, please include:

* A clear description of the vulnerability and its realistic impact.
* Step-by-step reproduction instructions.
* Any required configurations or permissions needed to trigger it.

## ⚠️ AI-Assisted Submissions and Scanners

Please do not submit raw, unverified output from AI tools or automated security scanners. If you use an AI tool to assist your research, you must manually verify that the vulnerability actually exists in a real-world deployment of this app before submitting. Unverified AI spam will be closed immediately.

## Out of Scope

The following are not considered vulnerabilities:

* Actions that require an Administrator account or high-trust roles (e.g., "An admin can delete the database").
* Issues caused by reverse proxies, third-party deployment tools, or intentionally unsafe configurations.
* Anything requiring access to the server host or the `/data` volume. In particular, secret notes on **non-PRF pairings** are documented as stored unencrypted in the SQLite file and included in JSON exports — protecting the host and your backups is the deployer's job. (Notes on PRF-capable pairings are end-to-end encrypted; breaking *that* without the physical key **is** in scope.)
* The `KEEYO_DISABLE_MFA` and `TRUST_PROXY` environment variables behaving as documented — they are deliberate operator escape hatches and require server access to set.
* The FIDO metadata (MDS) blob's JWT signature not being verified — it is only used to display device names, never for security decisions.
* Running Keeyo over plain HTTP on an untrusted network. TLS termination is explicitly delegated to your reverse proxy.
* Denial of service by an authenticated user against their own self-hosted instance.

In scope, and very much welcome: authentication/session flaws, cross-user data access, XSS/CSRF/injection, bypasses of the WebAuthn possession checks (secret reveal, MFA), and anything that lets an unauthenticated visitor read or change data.
