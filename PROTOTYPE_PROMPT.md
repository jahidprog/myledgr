# Shohel Business Management App — PROTOTYPE Build Prompt (Google Sheets–connected)

> **How to use this file.** Give it to an AI coding agent (e.g. Claude Code: save as `CLAUDE.md` in an empty repo, or paste as the first message). It describes a **prototype** that Shohel will use on his phone for a feedback round *before* the full production app (Flutter + Go + PostgreSQL) is built. The prototype keeps **all data directly in a Google Sheet**, works **offline**, and has a **built-in feedback system** so every comment lands in the sheet. Work through the milestones in order and do not skip the acceptance checks.

---

## 0. Working rules for the agent

1. **Goal = learn from Shohel quickly.** Breadth of features and realistic flows matter more than polish. But everything that exists must really work end to end (no fake buttons).
2. **Build all modules in §3** — the point is for Shohel to touch every feature we discussed.
3. **Google Sheet is the database.** No other server, no other database. The only backend is a Google Apps Script web app bound to the sheet.
4. **Offline-first.** The phone keeps a full local copy; every screen works with no internet; changes queue and sync later.
5. **Never delete money records.** Void with a reason (soft delete). Void cascades as specified in §5.4.
6. **Idempotent sync.** Every change is an operation with a client-generated `op_id`; the Apps Script ignores duplicates.
7. **Money:** the sheet stores amounts in **taka** (numbers, up to 2 decimals) so Shohel can read them. The web app computes with **integer paisa** internally (`Math.round(x * 100)`) and converts at the edges. No floating-point arithmetic on sums.
8. **All UI text is Bangla** with Bangla digits and Bangladeshi digit grouping (`৳১২,৪৫,০০০`). Code, comments, docs for the developer are English. The guide for Shohel (§12) is Bangla.
9. **Do not touch Shohel's real Excel workbook.** The prototype uses a new Google Sheet seeded with demo data.
10. Record every assumption in `docs/ASSUMPTIONS.md`. Where this prompt says "verify", check the current official documentation instead of relying on memory.
11. No secrets in git (the API token lives in Apps Script Script Properties and in the pairing link only).

---

## 1. Context

**Client / only user:** Shazzad Hossain Shohel, owner of a garment / sports-wear business. His business runs on one large Excel workbook ("Sportnest26") with customer accounts, payments, expenses, investments, assets, rate chart and irregularity records. It is hard to maintain: repeated "new account" sections, manual calculations, blank dates, payments mixed with orders, hard to search, can't be used away from a computer.

**Final product (later):** a private offline-first Android app that syncs to a backend and a synchronized Excel workbook.

**This prototype:** lets Shohel experience the planned screens, flows and calculations on his own phone, with data in a Google Sheet he can open and inspect. His feedback will drive the final requirements (especially the open questions in §13).

**What the prototype is *not*:** not secure enough for confidential data at scale, no background sync, no push notifications, no biometric unlock. These limits are listed in §14 and must be explained to Shohel.

---

## 2. Prototype architecture and why

```
 Shohel's phone (installed PWA, Bangla UI)                          Google account (developer's)
┌───────────────────────────────────────────┐   HTTPS (fetch,      ┌───────────────────────────────────────┐
│ Screens  →  state (local data + pending)  │   text/plain POST)   │ Apps Script web app  (bound to Sheet) │
│ IndexedDB: snapshot + outbox + settings   │ ───────────────────► │  doPost: push / snapshot / xlsx / ping│
│ Service worker: app works offline         │ ◄─────────────────── │  LockService, op_id dedupe, validation│
│ Sync engine: queue, retry, rebase         │                      │          ↓                            │
└───────────────────────────────────────────┘                      │  Google Sheet = the database          │
        hosted as static files on GitHub Pages                     │  tabs per entity + Balances + Summary │
                                                                    │  daily backup copy to Drive (trigger) │
                                                                    └───────────────────────────────────────┘
```

**Why a PWA + Apps Script instead of an APK**
- Shohel installs by opening **one link** and tapping "Add to Home screen". No sideloading, no Play Store, works on iPhone too (the phone model is still unknown).
- **Every fix reaches him instantly** (the app shows an "update available" banner). This makes the feedback loop fast.
- Apps Script writes **directly** into the Google Sheet with no OAuth flow, no Google Cloud project and no server to run.

**Alternative (only if explicitly requested):** a Flutter APK talking to the Sheets API with Google Sign-In. Heavier setup (Cloud project, OAuth consent screen, SHA-1 fingerprints) and slower feedback iterations.

**Hard constraints that shape the design**
- Apps Script web apps cannot return HTTP status codes or custom CORS headers. Use the **"simple request" pattern**: all authenticated calls are `POST` with `Content-Type: text/plain;charset=utf-8` and a JSON string body (no custom headers → no CORS preflight), `redirect: 'follow'`. The response is always HTTP 200 with JSON `{ok: true|false, ...}`. Verify this works from a GitHub Pages origin early (M1).
- Do **not** serve the UI from Apps Script `HtmlService` (iframe sandbox: no service worker, no PWA install, no offline).
- Keep the token **out of URLs**: authenticated actions are POST bodies only.

---

## 3. Features to build (all of them)

Priority tags: **[M]** must, **[S]** should, **[C]** could. Everything tagged [M] must be done before the prototype is handed to Shohel.

### 3.1 App shell
- **[M]** Bilingual-ready i18n file but Bangla only for now; all strings in one `strings.bn.ts`.
- **[M]** Bottom navigation: `হোম · কাস্টমার · অর্ডার · খরচ · রিপোর্ট`; a "আরও" (More) screen reaches: পেমেন্ট, বিনিয়োগ, সম্পদ, সমন্বয়/অনিয়ম, ফেরত, রেট চার্ট, খোঁজ (search), মতামত (feedback), সেটিংস.
- **[M]** Persistent status strip on every screen: `অনলাইন` / `অফলাইন` (amber), **Pending sync: N** (`সিঙ্ক বাকি: N`), last synchronized time (`শেষ সিঙ্ক: ২৮ সেপ্টেম্বর ২০২৬, সকাল ১০:৪২`), and a "এখনই সিঙ্ক" button. Never block data entry when offline.
- **[M]** PIN lock: set a 4-digit PIN on first run; lock on open, after 2 minutes in background, and after 5 wrong tries (30 s delay). PIN stored as a salted hash (WebCrypto PBKDF2). (Biometric is not in the prototype.)
- **[M]** Pairing: the developer sends one link `https://<pages-url>/#/pair?api=<encoded web app url>&token=<token>`. The app reads it, stores both, **removes the fragment from the address bar**, then runs the first sync. Also a manual entry fallback in Settings.
- **[M]** "নতুন সংস্করণ আছে — আপডেট করুন" banner when a new service worker is waiting; app version shown in Settings.
- **[M]** Toasts for: payment recorded, expense recorded, sync completed, sync failed.

### 3.2 Dashboard (হোম)
Total sales, total collected, total outstanding, today's expenses, this month's expenses, this month's sales, recent transactions (last 10 orders/payments/expenses merged by time), customers with outstanding balances (top 5, tap to open), pending sync count, last sync time, online/offline. A red badge "বড় বাকি" on customers whose outstanding exceeds the threshold (Settings, default ৳১,০০,০০০).

### 3.3 Customers
Add, edit, search, view. Fields: name, phone, address, notes. Profile: total sales, total payments, outstanding, number of orders, recent orders, payment history, returns and adjustments, last transaction, notes. Buttons on the profile: `＋ অর্ডার`, `＋ পেমেন্ট`.

### 3.4 Orders
For an existing customer: date (default today), memo number, notes, items. Item = product (free text with suggestions from the Rate Chart), quantity (whole pieces), **actual rate** (prefilled from the Rate Chart if a product matches, but editable; the saved rate stays on the order forever), line total (`quantity × rate`). Live order total. Option to record a payment in the same screen. **Editing an order = void the old order + create a new one** (`replaces_order_id`), done transparently with a note "সংশোধিত অর্ডার". Void with reason.

### 3.5 Payments
Independent transactions: customer, optional order/memo reference, amount, date, method chips (`নগদ · ব্যাংক · বিকাশ · নগদ(Nagad) · অন্যান্য` → `cash, bank, bkash, nagad, other`), notes. Screen shows current outstanding and "outstanding after payment". Multiple/partial payments. Void with reason. Overpayment allowed with a warning.

### 3.6 Expenses
Date, category (chips), amount, method, description, notes. Seeded Bangla categories: নাস্তা, কারিগর, কাটিং মাস্টার, ভাড়া, ট্রান্সপোর্ট, সাব্লিমেশন, এমব্রডায়রি, বেতন, পারচেজ, ক্যাশ আউট, মেশিন সার্ভিসিং, অন্যান্য. Owner can add custom categories. List grouped by day with today/this-month totals.

### 3.7 Investments
Date, amount, type, method, purpose, notes. Total invested; history list.

### 3.8 Assets
Name, quantity, purchase price, purchase date, method, status (`ব্যবহারে / বিক্রি / নষ্ট`), remarks. Total asset value (Σ quantity × price? **No** — `purchase_price` is the total price paid for that line; record the assumption and ask Shohel in the feedback questions).

### 3.9 Adjustments / Irregularities
Person, optional customer, kind (`advance, loan, deduction, returned_product, irregularity, other` → Bangla labels), direction (`পাওনা আছে / দেনা আছে` → `owed_to_business / owed_by_business`), amount, date, reason, notes, "গ্রাহকের বাকিতে যোগ হবে?" toggle (`affects_customer_outstanding`, default off). **Recoveries are separate history rows** (amount, date, note): original amount never changes; remaining = amount − Σ active recoveries. Example to support: ৳১,০০,০০০ irregularity, ৳২০,০০০ recovered twice → remaining ৳৬০,০০০.

### 3.10 Returns
From an order: pick item, quantity returned (≤ ordered − already returned), financial adjustment (prefilled `qty × rate`, editable), date, reason. Appears in the customer's history and reduces net sales.

### 3.11 Rate Chart
Product, material, GSM/specification, default rate, effective date. Reference only. Search. Changing a rate never alters existing orders.

### 3.12 Global search
One search box: customer name/phone, memo number, product, date, amount, payment, adjustment, expense description. Normalise Bangla/English digits and case on both sides. `2913` finds the order; `RM Sports` shows all that customer's records. Runs on local data (works offline).

### 3.13 Reports (all computed locally, work offline)
- বিক্রির রিপোর্ট: daily / weekly (**week starts Saturday**) / monthly / custom range
- কাস্টমার বাকি: customer, total sales, paid, outstanding (sortable)
- খরচ: total, by category (simple SVG bar chart), by date
- পেমেন্ট: total received, by method
- বিনিয়োগ: total + history
- সম্পদ: total value + list
- সমন্বয়/অনিয়ম: total, recovered, remaining
- **লাভ-ক্ষতি (খসড়া / DRAFT):** show two clearly labelled provisional figures — `বিক্রি − খরচ` and `আদায় − খরচ` — under a visible banner "এই হিসাবের নিয়ম এখনও ঠিক হয়নি" with a button "এই নিয়ম নিয়ে মতামত দিন" (opens feedback prefilled with screen `profit-loss`). Do not invent more complex accounting.
- **[S]** "Open in Google Sheets" button and "Excel (.xlsx) ডাউনলোড" button (see `xlsx` action in §5.2).

### 3.14 Sync, backup, settings
- Sync states per record: **Pending / Syncing / Synced / Failed** (+ "Needs review" list for rejected ops with Bangla reason and `আবার চেষ্টা` / `বাদ দিন`).
- Settings: pairing info (masked), PIN change, large-outstanding threshold, "ডেটা মিলিয়ে দেখুন" (reconciliation, §6.8), "ব্যাকআপ ফাইল ডাউনলোড (JSON)", "ডেটা রিসেট (শুধু এই ফোন)", version, "মতামত পাঠান".
- Backup in the cloud = the Sheet itself (version history) + the daily Drive copy made by Apps Script (§5.6).

### 3.15 Feedback system (the point of the prototype)
- **[M]** Floating button `মতামত` on **every screen**. Opens a sheet with: kind (`পরামর্শ / সমস্যা / ভালো লেগেছে / প্রশ্ন`), optional 1–5 rating, message (multiline), optional "এই স্ক্রিন" auto-filled. Saved as a `create` op for entity `feedback` → lands in the `Feedback` tab (works offline through the outbox like everything else).
- **[M]** **Guided test checklist** screen (`পরীক্ষার তালিকা`), see §12.2: each task has a checkbox and three quick answers (`সহজ লেগেছে / কঠিন লেগেছে / কিছু বাদ আছে`) + optional comment. Answers are saved as feedback rows with `kind = 'task'` and the task id in `screen`.
- **[M]** **Questions for you** screen (`কিছু প্রশ্ন`), see §12.3: each question has a text answer saved as feedback `kind = 'answer'`.
- Screen name for each feedback = the route (e.g. `orders/new`).

---

## 4. Google Sheet data model

One tab per entity, **row 1 = headers** (exact names below, English `snake_case`), data from row 2. Business columns first, system columns last. All tabs get frozen header rows. Do **not** store formulas in these data tabs.

**System columns on every business tab (in this order, at the end):** `status` (`active`/`void`), `void_reason`, `voided_at`, `created_at`, `updated_at`, `version`, `op_id`.

| Tab | Business columns |
|---|---|
| `Customers` | `id, name, phone, address, notes` |
| `Orders` | `id, customer_id, customer_name, memo_no, order_date, notes, total, replaces_order_id` |
| `OrderItems` | `id, order_id, customer_id, memo_no, product, quantity, rate, line_total` |
| `Payments` | `id, customer_id, customer_name, order_id, memo_no, amount, method, paid_on, notes` |
| `Returns` | `id, customer_id, customer_name, order_id, memo_no, order_item_id, product, quantity_returned, amount_adjustment, returned_on, reason` |
| `Expenses` | `id, expense_date, category, amount, method, description, notes` |
| `ExpenseCategories` | `id, name, is_custom, is_active` |
| `Investments` | `id, invested_on, amount, type, method, purpose, notes` |
| `Assets` | `id, name, quantity, purchase_price, purchased_on, method, asset_status, remarks` |
| `Adjustments` | `id, customer_id, customer_name, person, kind, direction, amount, adjusted_on, affects_customer_outstanding, reason, notes` |
| `Recoveries` | `id, adjustment_id, amount, recovered_on, note` |
| `RateChart` | `id, product, material, gsm_spec, default_rate, effective_from` |
| `Feedback` | `id, created_at, kind, rating, screen, message, app_version, device_id` (no status/version columns) |
| `_Ops` (hidden) | `op_id, entity, entity_id, result_json, applied_at` |

**Formatting rules (important Google Sheets gotchas)**
- Set these columns to **plain text** (`@`) *before* writing: all `id` / `*_id` columns, `phone`, `memo_no`, all date columns (`order_date, paid_on, expense_date, invested_on, purchased_on, adjusted_on, returned_on, recovered_on, effective_from`), and timestamps. Write dates as `yyyy-mm-dd` strings and timestamps as ISO-8601 UTC strings. Otherwise Sheets converts them to Date objects and leading zeros in phone numbers are lost.
- Amount/quantity/rate columns are numeric with a number format.
- Boolean columns store `TRUE`/`FALSE` (parse both strings and booleans when reading).
- Script and spreadsheet time zone: `Asia/Dhaka`.

**Readable computed tabs (formulas, maintained by the setup script)**
- `Balances` — one row per active customer: `customer_id, customer, total_sales, returns, net_sales, paid, adj_effect, outstanding, orders_count, last_txn_date`, using `SUMIFS`/`COUNTIFS`/`MAXIFS` over the data tabs with `status = "active"`. Build column letters programmatically from the header names (don't hard-code letters). Use `ARRAYFORMULA`/`FILTER` or script-maintained fill-down formulas — **whichever works in a real sheet; verify.**
- `Summary` — label/value rows: total sales, total returns, net sales, total collected, total outstanding, total expenses, this month's expenses, total invested, total asset value, adjustments total/recovered/remaining. These are used by the reconciliation check (§6.8) and let Shohel see the numbers directly in Sheets.

---

## 5. Apps Script backend (`apps-script/`)

Files: `Code.gs` (entry points), `Setup.gs`, `Api.gs`, `Domain.gs` (pure business functions), `Seed.gs`, `Backup.gs`, `SelfTest.gs`, `appsscript.json`. Deploy by pasting into the sheet's Apps Script editor (or via `clasp` if the developer prefers; document both).

### 5.1 `appsscript.json`
`timeZone: "Asia/Dhaka"`, `runtimeVersion: "V8"`, `webapp: { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" }`, and the OAuth scopes needed for: spreadsheet access, Drive (backup copies, xlsx export), triggers, external requests (xlsx export), container UI (menu). Verify the exact scope strings.

### 5.2 Web app API
All authenticated calls: **POST**, body = JSON string `{ "token": "...", "action": "...", ... }`. Response: `ContentService` JSON with `{ ok: true, ... }` or `{ ok: false, error: "<code>", message: "..." }`. Always HTTP 200. Wrap every handler in `try/catch`.

| Action | Request extras | Response |
|---|---|---|
| `GET` (no body) | — | `{ ok: true, service: "shohel-prototype", version }` (no token needed; used for connectivity checks) |
| `ping` | — | `{ ok: true, server_time }` |
| `snapshot` | `have` (client's last `data_version`, optional) | `{ ok: true, unchanged: true, data_version }` **or** `{ ok: true, data_version, tables: { customers: [...], orders: [...], ... }, summary: {...}, server_time }`. Rows are objects keyed by header, with types normalised (dates/ids as strings, amounts as numbers, booleans as booleans). Exclude `_Ops` and `Feedback` |
| `push` | `device_id`, `app_version`, `ops: [...]` (≤ 25) | `{ ok: true, results: [ {op_id, status, version?, code?, message?} ], data_version }` |
| `xlsx` | — | `{ ok: true, filename, base64 }` — export of the spreadsheet via `UrlFetchApp` to the Drive export URL with `ScriptApp.getOAuthToken()` |

Authentication: constant `TOKEN` kept in **Script Properties** (`API_TOKEN`), generated by `setup()` (≥ 32 random chars). Compare with a constant-time-style comparison. Wrong/missing token → `{ ok: false, error: "unauthorized" }`. A menu item **Rotate token** invalidates old pairing links.

### 5.3 Operation format (matches the future production protocol)
```json
{
  "op_id": "uuid", "entity": "payment", "entity_id": "uuid",
  "op": "create | update | void",
  "base_version": null,
  "client_created_at": "2026-10-10T08:12:44Z",
  "payload": { "...": "..." }
}
```
Entities: `customer, order, payment, return, expense, expense_category, investment, asset, adjustment, recovery, rate, feedback`.
- `order` payload contains `items: [ {id, product, quantity, rate} ]` and expands into one `Orders` row + N `OrderItems` rows in a single op.
- `void` payload: `{ reason }`.

### 5.4 Apply rules (in `Domain.gs`, pure + unit-testable)
For a batch: acquire `LockService.getScriptLock()` (wait up to 30 s; on failure return `{ok:false, error:"busy"}` so the client retries). Read the `_Ops` op_id column once into a Set. For each op in order:
1. If `op_id` is already in `_Ops` → result `duplicate` (return the stored result's version).
2. Validate (reject with a `code` and Bangla-friendly `message` key; **rejected ops are not recorded in `_Ops`**, so the client can fix and resubmit under a new `op_id`):
   - `amount > 0`, `quantity` positive integer, `rate ≥ 0`, dates match `yyyy-mm-dd` and are not more than 1 day in the future (`date_invalid`)
   - referenced `customer_id`/`order_id`/`order_item_id`/`adjustment_id`/`category` exist (`customer_not_found`, `order_not_found`, …); for payments, the customer must be active
   - order `total` and each `line_total` equal `quantity × rate` (recompute server-side and overwrite denormalised columns `customer_name`, `memo_no`, `total`, `line_total`)
   - `return.quantity_returned ≤ ordered quantity − already returned (active)` (`return_exceeds_ordered`)
   - `recovery.amount ≤ adjustment remaining` (`recovery_exceeds_remaining`)
   - `id` already exists from a different op → `id_conflict`
3. Apply:
   - `create`: append row(s) with `status='active'`, `version=1`, timestamps, `op_id`.
   - `update` (only `customer`, `rate`, `asset`, `investment`, `expense_category`; money rows are append-only): require `base_version == current version` else result `conflict` with `server_version`; bump `version`.
   - `void`: set `status='void'`, `void_reason`, `voided_at`; **cascade:** voiding an `order` voids its `OrderItems` and its `Returns`; voiding an `adjustment` voids its `Recoveries`; voiding an `order_item`-level return only voids that return. Idempotent if already void. Never delete rows.
4. Record `{op_id, entity, entity_id, result_json, applied_at}` in `_Ops`.
After the batch: increment `data_version` (Script Property), release the lock. Performance: group row appends per tab into a single `setValues` where possible; use `getDataRange` once per tab per request, not per op.

### 5.5 Setup menu (`onOpen` custom menu **Shohel App**)
- **১. Setup (create tabs, formats, formulas, token):** idempotent; creates all tabs/headers/formats, `Balances`, `Summary`, seeds `ExpenseCategories` with **fixed IDs** for the 12 Bangla names, creates the hidden `_Ops`, stores `API_TOKEN`, hides `_Ops`, protects header rows.
- **২. Load demo data / Clear all data (with confirmation).** Demo data in `Seed.gs` (§8). Writing demo data must go through the same domain functions as real ops (so it is valid).
- **৩. Generate pairing link:** prompts for the PWA URL, reads the web app URL (`ScriptApp.getService().getUrl()`), shows the final link in a dialog (and instructs: "send this link to Shohel only").
- **৪. Rotate token.** **৫. Run self-tests.** **৬. Back up now.**

### 5.6 Backup
`dailyBackup()` time-driven trigger (installed by Setup): copy the spreadsheet into a Drive folder `Shohel Prototype Backups`, keep the newest 14 copies, delete older ones.

### 5.7 Self-tests (`SelfTest.gs`, run from the menu)
Must cover: duplicate op returns `duplicate` and creates no second row; rejected op not recorded; void cascades (order→items/returns, adjustment→recoveries); stale `base_version` → `conflict`; recovery cannot exceed remaining; return cannot exceed ordered; balance calculation matches the golden vectors in `testdata/balance_vectors.json` (copy the vectors into a JS constant in the script). Tests must clean up their own rows.

### 5.8 Gotchas to handle
- Apps Script response may arrive via a redirect; the client must `follow` it.
- Script quotas: keep batches ≤ 25 ops, lock waits bounded, no per-op sheet reads.
- After editing the script, the developer must **Deploy → Manage deployments → edit → New version** (the web app URL stays the same). Document this.
- First authorisation shows "Google hasn't verified this app" → *Advanced → Go to project* — document with the exact clicks.

---

## 6. Web app (`web/`)

### 6.1 Stack
Vite + **Preact** + TypeScript, `@preact/signals` for state, a small router (e.g. `wouter-preact`), `idb` for IndexedDB, `vite-plugin-pwa` (Workbox) for the service worker and manifest, `vitest` for tests, `@fontsource/noto-sans-bengali` **bundled locally** so Bangla renders correctly offline. No UI framework with remote assets. Charts = hand-written SVG. Verify package versions and pin them in the lockfile. Equivalent choices are fine if justified in an ADR.

### 6.2 Structure
```
web/
├─ index.html, vite.config.ts, public/icons/ (192, 512, maskable)
└─ src/
   ├─ main.tsx, app.tsx, routes.tsx
   ├─ strings/strings.bn.ts
   ├─ core/       format.ts (৳, Bangla digits, lakh-crore, dates), parse.ts (Bangla→ASCII digits), uuid.ts, time.ts (Asia/Dhaka)
   ├─ data/       idb.ts, types.ts, apply.ts (pure applyOp), derive.ts (balances, reports), search.ts
   ├─ sync/       outbox.ts, engine.ts, api.ts, status.ts
   ├─ lock/       pin.ts, LockScreen.tsx
   ├─ features/   dashboard, customers, orders, payments, expenses, investments, assets, adjustments, returns, rates, reports, search, feedback, settings
   └─ components/ StatusStrip, MoneyInput, DateInput, Chips, ConfirmVoid, Toast, EmptyState, BarChart
```

### 6.3 Local data model (the key design)
- IndexedDB stores: `snapshot` (the last server `tables` + `data_version`), `outbox` (ops with `status`, `attempts`, `last_error`, `seq`), `meta` (`device_id`, `api_url`, `token`, `pin_hash`, `last_sync_at`, settings), `feedback_draft`.
- **Rebase model:** the UI state = `applyOps(snapshot, pendingOps)`, where `applyOp(state, op)` is a **pure function** (`data/apply.ts`) that mirrors the server's apply rules (cascades, denormalised fields, totals). The same function applies an op optimistically when the user saves **and** re-applies still-pending ops after a fresh snapshot arrives. This gives instant UI, correct offline totals and trivial conflict handling.
- Saving = in **one IndexedDB transaction**: append the op to `outbox` (the state recomputes). Money in integer paisa in memory; convert to/from taka at the API boundary.
- Derived values (`derive.ts`) are pure and shared by dashboard, profile, reports and search; unit-tested with golden vectors.

### 6.4 Sync engine
- Single-flight (a mutex). Triggers: app start/resume (`visibilitychange`), `online` event, manual button, every 60 s while open, right after each save when online.
- Cycle: (1) push pending ops in batches of ≤ 25 in `seq` order, marking them `syncing`; per result: `applied`/`duplicate` → remove from outbox (keep a small `synced` history for the UI), `rejected`/`conflict` → `needs_review` with message, network/`busy` error → back to `pending`, `attempts++`, exponential backoff (cap 5 min); (2) then `snapshot` with `have = data_version`; replace `snapshot`, keep remaining pending ops (rebase); (3) store `last_sync_at`.
- On start, any op stuck in `syncing` returns to `pending` (safe: server is idempotent).
- Timeouts (`AbortController`, 30 s) on every fetch. Never block the UI.
- Dependent ops: if a parent op (e.g. customer) is `needs_review`, dependants (order, payment) stay `pending` with a visible reason "অপেক্ষমান — আগের এন্ট্রি ঠিক করুন" instead of failing noisily.
- API client uses exactly the request shape in §2/§5.2.

### 6.5 PWA / offline
Precache the app shell, fonts and icons; runtime offline fallback for navigation; `registerType: 'prompt'` with the update banner; manifest (Bangla name `শোহেল ব্যবসা`, short name `শোহেল`, `display: standalone`, theme colour `#0f4c81`, icons incl. maskable). Test installability with Lighthouse. Confirm the app launches and works in flight mode after one online session.

### 6.6 Formatting and input
- `format.ts`: `৳` + Bangla digits + lakh/crore grouping via `Intl.NumberFormat('bn-BD', …)` — **verify** `১২৪৫০০০ → ১২,৪৫,০০০` with a test and add a fallback formatter if the runtime differs. Dates like `১২ সেপ্টেম্বর ২০২৬`. "Today / this month / this week (starts Saturday)" in **Asia/Dhaka**.
- `parse.ts`: accept Bangla **and** English digits (and the Bangla decimal separator) in every numeric/memo/date input; normalise to ASCII for storage and search.
- Numeric keypad (`inputmode="decimal"`) for amounts; big touch targets (≥ 48 px); date pickers default to today.

### 6.7 UI style
Mobile-first, one column, bottom nav, floating `মতামত` button. Palette: navy `#0f4c81` primary, teal `#1e88a8`, green `#15803d` (collected/paid), red `#b91c1c` (outstanding), amber `#b45309` (pending/offline). Never rely on colour alone. Confirm every void with a reason (no "delete" for money). Show derived values live (order total, outstanding after payment). Empty states with a helpful Bangla message and an action button.

### 6.8 Reconciliation check (builds trust)
Settings → `ডেটা মিলিয়ে দেখুন`: runs a fresh online `snapshot`; compares the app's locally derived totals (with no pending ops) against `summary` from the server (computed by Apps Script in JS) — and shows a table with ✓ / ✗ and the difference for: total sales, returns, collected, outstanding, expenses, invested, asset value, adjustments remaining. A ✗ gets a "মতামত পাঠান" shortcut. This is the prototype's version of the production reconciliation test.

### 6.9 Security (prototype level)
PIN lock (hash only); token never in URLs sent to servers (fragment is removed after pairing); no analytics; no third-party scripts; service worker caches only the app's own static files (never API responses). Show a short "প্রোটোটাইপ" notice in Settings. The local IndexedDB data is **not encrypted** — state this in `docs/LIMITATIONS.md`.

---

## 7. Business rules (identical to the production design)

All sums use **active** rows only.
```
net_sales(customer)  = Σ OrderItems.line_total (active items of active orders) − Σ Returns.amount_adjustment
paid(customer)       = Σ Payments.amount
adj_effect(customer) = Σ over active Adjustments with affects_customer_outstanding = TRUE and this customer:
                         +remaining if direction = owed_to_business, −remaining if owed_by_business
adjustment.remaining = amount − Σ active Recoveries
outstanding(customer)= net_sales − paid + adj_effect
```
Dashboard totals: total sales = Σ net_sales; collected = Σ paid; outstanding = Σ outstanding. Orders/items are immutable after save (edit = void + recreate). Payments, returns, recoveries are append-only (correct by void + new). Customers, rate chart, assets, investments, categories are editable (versioned).

Shared golden vectors: `testdata/balance_vectors.json` must be consumed by the web unit tests **and** the Apps Script self-test. Cases (minimum): two partial payments; voided payment ignored; voided order ignored; return reduces net sales; irregularity ৳১,০০,০০০ with recoveries ৳২০,০০০ ×2 → remaining ৳৬০,০০০; adjustment affecting outstanding in both directions; overpayment (negative outstanding); two customers independent.

---

## 8. Demo data (loaded by the menu action)

Enough to make every screen meaningful (all clearly fake): ~8 customers including **RM Sports**, Star Sports, Ctg Fashion, Dhaka Jersey; ~25 orders over three months including **memo 2913** for RM Sports (e.g. পোলো জার্সি ১০০ × ৳২৫০, ট্র্যাকস্যুট ৪০ × ৳৫০০ = ৳৪৫,০০০); ~30 payments with mixed methods and partial payments; ~60 expenses across all 12 categories; two investments (৳৩,০০,০০০ and ৳২,০০,০০০); ~8 assets (কাটিং মেশিন, ফ্যান, চেয়ার-টেবিল, …); one ৳১,০০,০০০ irregularity with two ৳২০,০০০ recoveries; two returns; 10 rate-chart rows. Dates relative to "today" so dashboards (today / this month) are non-empty. Mark seeded rows with `source` note in `notes` ("ডেমো") so they are easy to clear.

---

## 9. Repository layout

```
shohel-prototype/
├─ apps-script/          Code.gs Setup.gs Api.gs Domain.gs Seed.gs Backup.gs SelfTest.gs appsscript.json
├─ web/                  (see §6.2)
├─ testdata/             balance_vectors.json
├─ docs/
│  ├─ README.md          developer setup (§10)
│  ├─ ASSUMPTIONS.md  LIMITATIONS.md  FEEDBACK_QUESTIONS.md
│  ├─ SHOHEL_GUIDE_BN.md (§12.1)  UPGRADE_NOTES.md (§15)
│  └─ adr/
├─ .github/workflows/pages.yml
└─ CLAUDE.md             (this file)
```

---

## 10. Developer setup guide (write this into `docs/README.md` and follow it)

### 10.1 Machine (Arch Linux / macOS)
```bash
# Arch Linux
sudo pacman -Syu --needed git nodejs npm
# macOS
brew install git node
node --version && npm --version      # use a current LTS Node
# optional: Apps Script CLI
npm install -g @google/clasp
```

### 10.2 Create the Google Sheet and the script
1. In the developer's Google account create a new spreadsheet **"Shohel Prototype Data"** (empty).
2. **Extensions → Apps Script.** Paste each `.gs` file from `apps-script/` and `appsscript.json` (Project Settings → "Show appsscript.json"). Save.
3. Reload the sheet → menu **Shohel App → ১. Setup**. Approve permissions (*Advanced → Go to project*). Confirm all tabs were created and `Balances`/`Summary` formulas work.
4. **Shohel App → ২. Load demo data**, then **৫. Run self-tests** — all must pass.
5. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*. Copy the web app URL. Open the URL in a browser: it should show the `{ok:true, service:...}` JSON.
6. (Whenever the script changes: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.)

### 10.3 Build and host the PWA
```bash
cd web && npm install && npm run dev        # local dev (http://localhost:5173)
npm test && npm run build                   # unit tests + production build
```
- Create a GitHub repo, push, then **Settings → Pages → Source: GitHub Actions**. `.github/workflows/pages.yml` builds `web/` and deploys `web/dist`. Set Vite `base` to `/<repo-name>/` and the PWA `scope`/`start_url` to match. Result: `https://<user>.github.io/<repo>/`.
- Check the manifest, service worker and offline launch on the deployed URL (HTTPS required).

### 10.4 Pair a phone
Menu **Shohel App → ৩. Generate pairing link** → paste the Pages URL → copy the generated link → open it on the phone → set a PIN → first sync loads the demo data. Install: Android Chrome ⋮ → *Install app*; iPhone Safari → Share → *Add to Home Screen*.

### 10.5 Release flow for feedback rounds
Commit → CI (tests + build) → GitHub Pages deploy. Bump the version string shown in Settings every round. If `apps-script/` changed, **deploy a new script version** and also run **Setup** again (it must be idempotent and migrate headers/formats safely). Keep the Apps Script API backward compatible with the previous web version for at least one round (include `app_version` in pushes; reject clearly if too old).

---

## 11. Implementation plan (milestones)

**M0 — Repo and tooling.** Create the layout, lint/format, Vitest, CI, Pages workflow, ADR 0001 (why PWA + Apps Script). *Accept:* CI green on an empty shell deployed to Pages and installable.

**M1 — Sheet + Apps Script.** Setup, tabs/formats/formulas, token, `push` (all entities, validation, cascades, idempotency, locking), `snapshot` (with `summary`), `xlsx`, demo seed, backup trigger, self-tests, menu. *Accept:* all self-tests pass; calling `push` twice with the same batch from `curl` creates no duplicates (`curl -s -X POST -H 'Content-Type: text/plain;charset=utf-8' --data '{...}' "$WEBAPP_URL"`, using `-L`); the **cross-origin `fetch` from the deployed Pages origin succeeds** (prove it with a tiny test page now, before building UI).

**M2 — Web shell + offline core + Expenses end to end.** PWA shell, fonts, i18n, formatting/parsing with tests, PIN lock, pairing link, IndexedDB, `applyOp`/rebase, outbox, sync engine, status strip, update banner, Expenses (list/add/categories/void). *Accept (demo on a real phone):* flight mode → add 3 expenses (instant, `সিঙ্ক বাকি: ৩`) → close and reopen app (still there) → flight mode off → pending 0 → the 3 rows are in the `Expenses` tab **exactly once**; re-sending the batch creates none; the app launches offline from the home-screen icon.

**M3 — Customers, orders, payments, balances.** Screens per §3.3–3.5, `derive.ts` balances, golden-vector tests in web, dependency handling, Needs-review list. *Accept:* create customer → order (2 items) → two partial payments → outstanding correct on phone and in `Balances`; void a payment → both update; edit order (void + recreate) keeps totals right.

**M4 — Remaining modules.** Investments, assets, adjustments + recoveries, returns, rate chart, custom categories. *Accept:* the ৳১,০০,০০০/৳২০,০০০×2 → ৳৬০,০০০ example works; returns cap enforced; changing a rate doesn't change old orders.

**M5 — Dashboard, reports, search.** *Accept:* all reports work in flight mode; totals equal `Summary`; search `2913` and `RM Sports` behave as specified.

**M6 — Feedback system and reconciliation.** Floating feedback button on every screen, test checklist, questions screen, `ডেটা মিলিয়ে দেখুন`. *Accept:* feedback written offline appears in the `Feedback` tab after sync with the right screen name and app version; reconciliation shows ✓ on demo data.

**M7 — Docs, deploy, hand-over package.** `docs/README.md`, Bangla guide for Shohel, LIMITATIONS, FEEDBACK_QUESTIONS, UPGRADE_NOTES; production deploy; pairing link. *Accept:* a person who has never seen the project can follow `docs/README.md` from zero to a paired phone.

**M8 — QA pass on a real low-end Android phone and an iPhone if available.** Run §14's checklist. Fix, redeploy, then hand over.

---

## 12. Hand-over to Shohel and the feedback process

### 12.1 `docs/SHOHEL_GUIDE_BN.md` (write in simple Bangla, one page + screenshots)
Must explain, in plain language: what this trial app is (a trial version, data is demo data), how to open the link, how to install on the home screen (Android and iPhone), setting the PIN, what to do when there is no internet and how to sync (open the app when net returns, tap `এখনই সিঙ্ক`), how to give feedback (the `মতামত` button, the test checklist, the questions screen), how to open the Google Sheet to see the data, and who to call if something breaks. Tone: friendly, short sentences.

### 12.2 Guided test checklist (in-app, Bangla; ids `t01…t15`)
1. পিন সেট করে অ্যাপ খুলুন · 2. নতুন কাস্টমার যোগ করুন · 3. ২টি পণ্যসহ একটি অর্ডার তুলুন · 4. আংশিক পেমেন্ট নিন · 5. কাস্টমারের বাকি দেখুন (ঠিক আছে কি?) · 6. একটি খরচ লিখুন · 7. একটি বিনিয়োগ লিখুন · 8. একটি সম্পদ যোগ করুন · 9. একটি অনিয়ম লিখে দুইবার আদায় যোগ করুন · 10. একটি পণ্য ফেরত লিখুন · 11. মেমো নম্বর দিয়ে খুঁজুন · 12. ইন্টারনেট বন্ধ করে একটি খরচ লিখুন, তারপর নেট চালু করে সিঙ্ক দেখুন · 13. রিপোর্টগুলো দেখুন · 14. Google Sheet-এ ডেটা দেখুন · 15. পুরো অ্যাপ নিয়ে সামগ্রিক মতামত দিন.

### 12.3 Questions for Shohel (`docs/FEEDBACK_QUESTIONS.md` and the in-app screen)
1. হোম স্ক্রিনে সবচেয়ে আগে কী দেখতে চান? 2. কোন শব্দ বা লেবেল ঠিক লাগছে না? 3. কোন তথ্য/ঘর বাদ আছে (অর্ডার, পেমেন্ট, খরচ)? 4. পণ্যের পরিমাণ কি সবসময় পিস, নাকি কখনো কেজি/মিটার/ডজন? 5. সম্পদের "ক্রয়মূল্য" কি মোট দাম, নাকি প্রতি পিস দাম? 6. অনিয়ম/অগ্রিম/ধার কি কাস্টমারের বাকিতে যোগ-বিয়োগ হবে? কোনটা হবে, কোনটা হবে না? 7. লাভ-ক্ষতি কীভাবে হিসাব করতে চান? কী কী খরচ ধরা হবে, বিনিয়োগ ও সম্পদ ধরা হবে কি? 8. মেমো নম্বর কীভাবে দেন (শুধু সংখ্যা, নাকি অক্ষরসহ)? 9. সপ্তাহ কি শনিবার থেকে শুরু? 10. কতটা বাকি হলে "বড় বাকি" সতর্কতা চান? 11. কোন রিপোর্ট সবচেয়ে বেশি লাগবে, কোনটা লাগবে না? 12. ফোনে কি আর কেউ (কর্মচারী) ব্যবহার করবে? 13. Excel ফাইল কি এখনও আলাদা করে লাগবে, নাকি অ্যাপই যথেষ্ট? 14. আপনার ফোন কোনটা (Android/iPhone, মডেল)?

### 12.4 Reading the feedback
All feedback lands in the `Feedback` tab (kind, rating, screen, message, app version). Provide a `docs/FEEDBACK_TRIAGE.md` template: after each round, cluster by screen, tag `bug / missing field / wording / new feature / rule question`, and convert accepted items into changes + a change log shown to Shohel in the next round.

---

## 13. Open questions the prototype is meant to answer
Same list as §12.3 plus: Android vs iPhone; accounting rules for profit/loss; semantics of adjustments; quantity units; asset price meaning; memo number format; week start; whether Excel output is still needed. Defaults used until answered are in `docs/ASSUMPTIONS.md`.

---

## 14. Known limitations (state them to Shohel and in `docs/LIMITATIONS.md`)

- **Sync happens only while the app is open** (PWAs can't reliably sync in the background; on iPhone support is more limited). After working offline, open the app when internet is back and tap `এখনই সিঙ্ক`.
- No biometric unlock, no push/OS notifications (in-app toasts and badges only).
- Local data is not encrypted; the web app URL + token grant access to the sheet — **use demo or low-sensitivity data in this round** unless the developer and Shohel agree otherwise. Rotate the token before the final handover.
- Google Sheets/Apps Script is slower than a database: use for up to a few thousand rows per tab; batches are small on purpose.
- Excel export is generated from the Google Sheet (`xlsx` download), not from Shohel's original layout.
- The prototype data lives in the developer's Google account.

**QA checklist (M8):** offline launch from the icon; add data offline then sync; duplicate-safe resend; kill app mid-sync; phone clock wrong; PIN lockout; update banner shows after a new deploy; Bangla digits and grouping everywhere; tiny screen (320 px) and large font setting; slow network; two phones paired at once (changes appear on both after sync); void flows; large demo dataset (2,000+ rows) still smooth.

---

## 15. What carries over to the production app

Document in `docs/UPGRADE_NOTES.md`: the screens and Bangla strings, the balance rules and golden vectors, the operation format (`op_id`, create/update/void) and idempotency design, the rebase model, the feedback decisions and the final answers to §12.3, plus the sheet columns as a draft of the production schema. Throw-away parts: Apps Script backend, the PWA shell and IndexedDB layer (replaced by Flutter + Drift and Go + PostgreSQL).

---

## 16. Deliverables checklist (Definition of Done)

- [ ] Google Sheet setup script, API, demo data, backup trigger, self-tests all working
- [ ] PWA deployed to GitHub Pages, installable, works offline after the first load
- [ ] All [M] features in §3 implemented; [S]/[C] items done or listed in `docs/ASSUMPTIONS.md` as deferred
- [ ] Unit tests (web) and self-tests (Apps Script) green; golden vectors shared by both
- [ ] Cross-origin POST from the Pages origin to the web app verified
- [ ] Feedback button on every screen, checklist screen, questions screen, all writing to the `Feedback` tab (online and offline)
- [ ] Reconciliation screen shows ✓ on demo data
- [ ] Docs complete: developer README, Bangla guide for Shohel, limitations, feedback questions, triage template, upgrade notes
- [ ] Tried on a real phone in flight mode following the M2 acceptance script

---

## Appendix A — Client request/response pattern (do exactly this)

```ts
// web/src/sync/api.ts  (sketch — keep the shape, adapt the types)
export async function call<T>(apiUrl: string, token: string, action: string, extra: object = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
    body: JSON.stringify({ token, action, ...extra }),
    redirect: 'follow',
    signal,
  });
  const json = await res.json();
  if (!json.ok) throw Object.assign(new Error(json.message ?? json.error), { code: json.error });
  return json as T;
}
```
```js
// apps-script/Code.gs  (sketch)
function doGet() { return json_({ ok: true, service: 'shohel-prototype', version: VERSION }); }
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!tokenOk_(body.token)) return json_({ ok: false, error: 'unauthorized' });
    switch (body.action) {
      case 'ping':     return json_({ ok: true, server_time: new Date().toISOString() });
      case 'snapshot': return json_(snapshot_(body));
      case 'push':     return json_(push_(body));
      case 'xlsx':     return json_(xlsx_());
      default:         return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String(err) });
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

## Appendix B — Error codes → Bangla messages (`strings.bn.ts`)
`unauthorized` → "অনুমতি নেই — আবার পেয়ার করুন" · `busy` → "সার্ভার ব্যস্ত, আবার চেষ্টা হচ্ছে" · `customer_not_found` → "কাস্টমার পাওয়া যায়নি" · `order_not_found` → "অর্ডার পাওয়া যায়নি" · `date_invalid` → "তারিখ ঠিক নয়" · `amount_invalid` → "টাকার অঙ্ক ঠিক নয়" · `return_exceeds_ordered` → "অর্ডারের চেয়ে বেশি ফেরত দেওয়া যাবে না" · `recovery_exceeds_remaining` → "বাকি অঙ্কের চেয়ে বেশি আদায় লেখা যাবে না" · `stale_version` → "অন্য জায়গায় এটি বদলে গেছে" · `id_conflict` → "এই এন্ট্রি আগেই আছে" · `client_too_old` → "অ্যাপ আপডেট করুন".

## Appendix C — `pages.yml` outline
```yaml
name: pages
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: cd web && npm ci && npm test && npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: web/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.d.outputs.page_url }}" }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```
(Verify action versions against current docs.)
