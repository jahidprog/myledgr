# SECURITY.md — Shohel Business Management App (Prototype)

> **Audience:** the developer and any AI coding agent working on the prototype (PWA + Google Apps Script + Google Sheet).
> **Status of this document:** binding for the prototype. Every rule marked **MUST** is part of the Definition of Done. Items marked **SHOULD** are expected unless a reason is recorded in `docs/ASSUMPTIONS.md`.
> **Honest posture:** this prototype is built to *collect feedback quickly*, not to protect confidential business data for years. It has sensible controls for a small trial with **demo or low-sensitivity data**. Section 9 lists what is deliberately not solved and how the production app (Flutter + Go + PostgreSQL) fixes it.

---

## 1. Scope and security goals

**In scope:** the installed PWA (browser storage, service worker), the Apps Script web app, the Google Sheet and Drive backups, the GitHub repository and Pages deployment, the pairing link, and the feedback data.

**Goals, in priority order**
1. **Nobody except Shohel (and the developer) can read or change the data** through the app or the API.
2. **No silent data loss or corruption:** no hard deletes of money records, idempotent sync, backups, locking.
3. **No injection:** user-entered text can never run as script in the app or as a formula in Sheets/Excel.
4. **Small blast radius:** if the phone, the pairing link or the token leaks, the damage is limited and recovery takes minutes.
5. **Honesty:** every limitation is documented and told to Shohel.

**Non-goals (prototype):** protection against a determined attacker with physical access to an unlocked/rooted phone, nation-state threats, regulatory compliance, multi-user permissions.

---

## 2. Data classification and the demo-data rule

| Class | Examples | Rule in the prototype |
|---|---|---|
| **Business-confidential** | Real customer names/phones, real amounts, real investments, assets, irregularities | **MUST NOT** be entered in the first feedback round. Use the seeded demo data. Real data only after a written agreement between developer and Shohel, after token rotation, and with the checklist in §8 passed |
| **Low sensitivity** | Demo customers/orders, wording and UX feedback | Allowed |
| **Secrets** | API token, pairing link, PIN hash/salt, developer Google/GitHub credentials | Never logged, never committed, never in URLs sent to servers |

Tell Shohel plainly (in the Bangla guide): *"এই ট্রায়ালে আসল গ্রাহকের নাম, ফোন বা আসল টাকার হিসাব লিখবেন না।"* If Shohel decides to use real data anyway, record the decision and complete §8 first.

---

## 3. Assets, actors and threats

| Asset | Where it lives |
|---|---|
| Business data | Google Sheet tabs, Drive backup copies, phone IndexedDB |
| API token | Apps Script Script Properties; phone IndexedDB; the pairing link |
| PIN (hashed) | Phone IndexedDB |
| Source code, deploy pipeline | GitHub repo, GitHub Pages, Apps Script project |
| Developer accounts | Google account, GitHub account |

| Threat | Example | Main controls |
|---|---|---|
| Someone picks up Shohel's phone | Family member, shop visitor | PIN lock, auto-lock, lockout delays |
| Pairing link or token leaks | Forwarded WhatsApp message, screenshot | Fragment removal, token rotation, one recipient, short-lived distribution |
| Someone finds the web app URL | URL in a screenshot or log | Token required for every action; URL alone gives nothing |
| Script injection (XSS) | Customer named `<img src=x onerror=…>` | Framework escaping, CSP, no `dangerouslySetInnerHTML`, no third-party scripts |
| Formula injection | Note = `=HYPERLINK("http://evil","click")` exported to Excel | Text-formatted columns + neutralisation (§5.6) |
| Malicious or compromised dependency | npm package takeover | Lockfile, minimal deps, `npm audit`, pinned actions, no install scripts |
| Account takeover of the developer | Phished Google/GitHub login | 2-step verification, passkeys/hardware key, dedicated account |
| Tampered client | Modified request with negative amounts | Server-side validation of everything |
| Accidental loss | Wrong void, deleted tab, bad deploy | Soft delete, `_Ops` log, version history, daily backups, protected ranges |
| Abuse of the endpoint | Token guessing, oversized payloads | High-entropy token, size limits, bounded batches, logging + alert |

---

## 4. Trust boundaries

```
 Shohel's phone (partly trusted)                 Internet                 Google (trusted platform)
┌───────────────────────────────┐                                   ┌──────────────────────────────┐
│ PWA (static files from Pages) │  HTTPS POST (token in body)       │ Apps Script web app          │
│ IndexedDB: data, outbox,      │ ─────────────────────────────────►│  - verifies token            │
│   token, PIN hash             │                                   │  - validates + sanitises     │
│ Service worker (same origin)  │ ◄───────────────────────────────── │  - writes to the Sheet       │
└───────────────────────────────┘                                   └──────────────┬───────────────┘
        ▲ untrusted input from the user & from the network                         │
        │ (every value is validated again on the server)            Google Sheet + Drive backups
GitHub Pages (static host) – serves code only, never sees data or the token
```
**Rule:** *the client is never trusted.* Client-side validation is for UX; the Apps Script re-validates everything.

---

## 5. Security controls (requirements)

### 5.1 Pairing and API token
- **MUST** generate the token in Apps Script `setup()`: at least two concatenated random UUIDv4 values (≥ 244 random bits), stored only in **Script Properties** (`API_TOKEN`). Verify the generator's suitability in the current Apps Script docs; if in doubt, mix several sources.
- **MUST** accept the token only in the **POST body**, never in a query string or header. (`doGet` returns only a public health message and needs no token.)
- **MUST** compare tokens with a constant-time loop (compare all characters, accumulate differences) — no early return on the first mismatch.
- **MUST** add a small fixed delay (`Utilities.sleep(…)`) on wrong tokens and count failures in `CacheService`; when failures exceed a threshold (e.g. 20 per 10 minutes), email the developer via `MailApp`. Do **not** hard-lock after N failures (an attacker could then lock Shohel out); alert instead.
- **MUST** deliver the token to the phone only through the **pairing link** `…/#/pair?api=…&token=…`. The token is in the URL *fragment*, which browsers do not send to servers. After reading it the app **MUST** replace the address with `history.replaceState` so the token is not left in the address bar or history.
- **MUST** provide **Shohel App → Rotate token** (invalidates all existing pairings) and a Settings → "ফোন আনপেয়ার করুন" action that deletes the token and local data on the phone.
- **SHOULD** send the pairing link to Shohel through a one-to-one channel, tell him to delete the message after pairing, and rotate the token when the prototype round ends.

### 5.2 App lock (PIN)
- **MUST** hash the PIN with PBKDF2-SHA-256 via WebCrypto with a random 16-byte salt and a high iteration count (check current OWASP guidance for the number); store only salt + hash.
- **MUST** lock on open, after 2 minutes in the background, and on explicit "লক করুন". After 5 wrong attempts impose an increasing delay (30 s, 1 min, 5 min…); persist the attempt counter so reloading the page does not reset it.
- **MUST** clearly document that the PIN is a **screen lock, not encryption**. A 4-digit PIN has only 10,000 possibilities; it stops casual access, not someone who extracts the browser storage. **SHOULD** offer a 6-digit PIN.
- **COULD** (stretch): derive an AES-GCM key from the PIN (PBKDF2) and encrypt IndexedDB values at rest. If implemented, never store the key; document the lost-PIN consequence (data is recovered by re-pairing and syncing).
- **MUST NOT** show amounts/names on the lock screen or in the page title.

### 5.3 Web app hardening (XSS and friends)
- **MUST** render all user text through the framework's normal escaping. **Forbidden:** `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, string-built HTML. Enforce with ESLint rules and a CI grep.
- **MUST** ship a Content Security Policy. GitHub Pages cannot set headers, so use `<meta http-equiv="Content-Security-Policy">`. Baseline (tighten/verify with the real build):
  ```
  default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self'; connect-src 'self' https://script.google.com https://script.googleusercontent.com;
  object-src 'none'; base-uri 'none'; form-action 'none'; manifest-src 'self'; worker-src 'self'
  ```
  The build must not require `'unsafe-inline'` or `'unsafe-eval'`; if the toolchain forces inline styles, use hashes/nonces or move styles to files. Note that `frame-ancestors` is not available in a meta CSP.
- **MUST** use **no third-party scripts, fonts, analytics, CDNs or trackers**. Fonts are bundled locally. Add `<meta name="referrer" content="no-referrer">`.
- **SHOULD** add a tiny anti-framing guard (if `window.top !== window.self`, refuse to render) because Pages can't send `X-Frame-Options`.
- **MUST** keep sensitive values out of the URL (routes contain ids at most — never names, phones or amounts), out of `console.log`, out of error messages and out of the feedback `screen` field.
- **MUST** treat all data from the snapshot as untrusted text too (a malicious row in the sheet must not break the UI).
- **MUST** validate and normalise all numeric/date input (`parse.ts`), enforce maximum lengths on text fields (e.g. names 120, notes 1000) in the UI **and** server.

### 5.4 Service worker and offline storage
- **MUST** cache only the app's own static assets. **Never cache API responses** (the Apps Script origin is excluded from runtime caching).
- **MUST** use `registerType: 'prompt'` so updates are explicit and visible; show the version in Settings.
- **MUST** provide **Settings → "এই ফোন থেকে ডেটা মুছুন"** (clears IndexedDB, caches, token, PIN) and call it automatically on un-pairing.
- **SHOULD** request persistent storage (`navigator.storage.persist()`) so the browser doesn't silently evict the outbox; warn the user if it is refused and pending ops exist.
- IndexedDB is not encrypted (see §9). **MUST** say so in the in-app prototype notice.

### 5.5 Apps Script backend
- **MUST** run as *Execute as: Me* with the **minimum OAuth scopes** needed; review `appsscript.json` for scope creep.
- **MUST** authenticate every action (except the public health `GET`) and return `{ok:false,error:"unauthorized"}` otherwise.
- **MUST** validate every field server-side: types, ranges (`amount > 0`, integer `quantity`), enumerations (allow-lists for `method`, `kind`, `direction`, `asset_status`), date format and sanity, referential integrity, recomputed totals, lengths. **Reject** unknown entities/actions and unknown payload fields (don't store what you don't expect).
- **MUST** enforce size limits: max request body (e.g. 200 KB), ≤ 25 ops per batch, max string lengths, max items per order.
- **MUST** use `LockService` around writes; bounded wait; return `busy` instead of blocking forever.
- **MUST** keep **idempotency**: duplicate `op_id` returns the stored result. Rejected ops are not recorded.
- **MUST** soft-delete only; no code path deletes a money row. Voids need a reason and cascade as specified.
- **MUST NOT** echo stack traces or internal details to clients: return a generic message plus a short correlation id; keep details in Apps Script logs.
- **MUST NOT** make outbound requests to user-supplied URLs (no SSRF). The only `UrlFetchApp` call is the fixed Google export URL.
- **MUST NOT** log tokens, PINs or financial values. Log only counts, op ids and error codes.
- **SHOULD** keep the `xlsx` action behind the same token and limit how often it can be called.

### 5.6 Formula injection (CSV/Excel injection) — important
Any text a user types (notes, names, descriptions, feedback) ends up in a Google Sheet and in the exported `.xlsx`. A value beginning with `=`, `+`, `-` or `@` can be executed as a formula when opened.
- **MUST** set all **text** columns to plain text format (`@`) before writing (ids, phone, memo, dates, names, notes, descriptions, reasons, feedback message).
- **MUST** additionally neutralise risky strings in `Domain.gs` with one function used for every text field: if a string starts with `= + - @` (also after leading whitespace/control characters, and tab/CR), prefix a single quote `'` — and strip that prefix again when reading rows back into the snapshot. **Verify** actual behaviour in a self-test (`'=1+1` stays text in the sheet and in the exported xlsx).
- **MUST** add self-tests with payloads such as `=HYPERLINK("http://example.com","x")`, `+cmd|' /C calc'!A0`, `@SUM(1+1)`, and `-2+3` to prove they remain inert text.
- Numeric columns accept only validated numbers (never strings).

### 5.7 Google Sheet, Drive and accounts
- **MUST** enable **2-Step Verification** (prefer passkeys/security key) on the Google account that owns the sheet and script, and on the GitHub account. **SHOULD** use a **dedicated Google account** for the prototype to limit the blast radius.
- **MUST** keep the spreadsheet private: no "anyone with the link". Share with Shohel as **Viewer** only if he wants to look (so he can't break structure).
- **MUST** protect header rows, `Balances`, `Summary` and `_Ops` (hidden + protected range / warning).
- **MUST** keep the Apps Script project and the Drive backup folder private; backups pruned to the newest 14.
- **SHOULD** review Apps Script *Executions* and the sheet's *Version history* weekly during the trial.

### 5.8 Supply chain and CI/CD
- **MUST** commit lockfiles; use `npm ci` in CI; keep the dependency list small and justified (ADR for each new runtime dependency); no `postinstall`-script packages without review.
- **MUST** run `npm audit --audit-level=high` (fail the build on high/critical) and enable Dependabot (or equivalent) for npm and GitHub Actions.
- **MUST** run a secret scanner (e.g. gitleaks) in CI and as a pre-commit hook; `.gitignore` covers `.env*`, key files, `clasp` credentials (`.clasprc.json`, `.clasp.json` only if it contains no secrets).
- **SHOULD** pin third-party GitHub Actions to a commit SHA, grant workflows least-privilege `permissions`, require 2FA and branch protection on `main`, and require CI green before deploy.
- **MUST NOT** commit the web app URL together with the token, pairing links, demo exports containing real data, or screenshots showing tokens.

### 5.9 Privacy and data minimisation
- No analytics, no tracking, no third-party calls.
- Feedback may contain personal details by accident: the feedback screen carries a reminder "ব্যক্তিগত তথ্য লিখবেন না".
- **MUST** delete the sheet data, Drive backups, pairing links and the deployed Pages site (or rotate and archive) when the prototype round ends or when moving to production; export the `Feedback` tab first.

### 5.10 Logging and monitoring
- Keep Apps Script logging on; log *events*, not *values*: `unauthorized`, `rejected(code)`, `busy`, `push(n_ops, n_applied, n_dup)`, durations.
- Email the developer on repeated `unauthorized`, on `server_error` bursts, and when the daily backup fails.
- Client: no remote error reporting in the prototype; show errors in the UI only.

---

## 6. Secure development rules (quick list)

**DO**
- Validate on the server; treat the client as hostile.
- Use the shared `sanitizeText()` for every user string written to a sheet.
- Keep functions that touch secrets tiny and tested.
- Write a self-test for every new validation rule and every new entity.
- Update this document when a control changes.

**DON'T**
- Put tokens in URLs, logs, commits, screenshots, issue trackers or chat.
- Use `innerHTML`/`dangerouslySetInnerHTML`/`eval`.
- Add third-party scripts, CDNs, fonts, analytics or "quick" libraries without an ADR.
- Delete rows from money tabs, or overwrite an original amount.
- Cache API responses in the service worker.
- Widen the OAuth scopes or the sharing settings without recording why.

---

## 7. Incident response runbook

| Situation | Do this, in order |
|---|---|
| **Phone lost / stolen** | 1) Menu **Rotate token** (all phones must re-pair). 2) Pair Shohel's new phone. 3) Check the sheet's version history and `_Ops` for activity after the loss. 4) Note the incident in `docs/INCIDENTS.md` |
| **Pairing link or token leaked** | Rotate token immediately; re-pair; review Executions and version history; tell Shohel |
| **Unexpected data changes** | Stop sharing the link; restore from version history or the latest Drive backup; compare `_Ops` to find the offending ops; rotate token |
| **Developer's Google/GitHub account compromised** | Change password, revoke sessions/app access, rotate the token, review Apps Script triggers and deployments, review Pages and Actions settings; restore from backup if needed |
| **Wrong data entered / mass void** | Use version history to restore the affected tab; re-sync phones (pull a fresh snapshot) |
| **Backup failed** | Run "Back up now"; check Drive quota and trigger status |

Rotation steps must be tested before the first handover.

---

## 8. Pre-handover security checklist (all must pass)

**Auth and tokens**
- [ ] A request with a wrong/missing token is rejected with `unauthorized`; the delay and failure counter work
- [ ] No token in any URL, query string, console output, log or committed file (grep the repo and the build output)
- [ ] After pairing, the address bar and history no longer contain the token
- [ ] **Rotate token** makes the old pairing fail and the new link work

**App**
- [ ] A customer named `<img src=x onerror=alert(1)>` and a note containing `<script>` display as plain text
- [ ] CSP active; browser console shows **no CSP violations** on all screens
- [ ] No third-party network requests (check the Network tab); fonts/icons are local
- [ ] Lighthouse PWA/Best-Practices checks reviewed; service worker does not cache API calls
- [ ] PIN lockout survives a page reload; locked app shows no data; auto-lock works
- [ ] "এই ফোন থেকে ডেটা মুছুন" clears IndexedDB, caches, token and PIN

**Server and sheet**
- [ ] Tampered requests rejected: negative/zero amount, non-integer quantity, bad dates, unknown fields/entities, wrong enum values, oversized body/batch
- [ ] Duplicate `op_id` creates no second row; void cascades work; no code path deletes money rows
- [ ] Formula payloads (`=HYPERLINK(…)`, `+…`, `-…`, `@…`) are stored inert in the sheet **and** in the exported `.xlsx`
- [ ] Error responses contain no stack traces
- [ ] Sheet not shared by link; header/computed tabs protected; Drive backup folder private; backups prune correctly

**Accounts and pipeline**
- [ ] 2-Step Verification on the Google and GitHub accounts
- [ ] `npm audit` clean (no high/critical); Dependabot enabled; gitleaks clean; Actions pinned and least-privilege
- [ ] Demo data only (or written agreement recorded + token rotated before real data)

---

## 9. Known gaps and the production fix

| Gap in the prototype | Risk | Production answer |
|---|---|---|
| Single shared token as the only API auth; endpoint publicly reachable | Anyone with URL + token has full access | Per-device credentials, short-lived access tokens, refresh rotation, revocation per device, server behind Caddy/HTTPS with rate limiting |
| PIN is a screen lock; IndexedDB unencrypted | Extracted browser storage is readable | Encrypted SQLite (SQLCipher), key in Android Keystore, biometric |
| Data in the developer's Google account; Apps Script runs as the developer | Account compromise exposes all data | Dedicated backend and database owned by the business, encrypted backups, audit log |
| No background sync; sync only when app open | Data can sit on the phone longer | Android background tasks + visible pending count |
| No per-user roles | Single user only | Role model if employees are added later |
| No remote monitoring beyond Apps Script logs | Slow detection | Sentry, uptime checks, alerting |
| Meta CSP only; no HTTP security headers | Weaker clickjacking/CSP coverage | Real response headers on the production web surface |
| Spreadsheet as a database | Limits, speed, structural edits by hand | PostgreSQL with constraints and migrations |

---

## 10. Reporting a vulnerability or mistake

If you notice a security problem (leaked link, odd data, suspicious access): tell the developer immediately, do **not** share details in public channels, and follow §7. The developer records every incident, the cause and the fix in `docs/INCIDENTS.md`, and updates this document if a control was missing.
