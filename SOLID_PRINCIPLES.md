# SOLID_PRINCIPLES.md — Design Rules for the Shohel Prototype

> **Audience:** the developer and any AI coding agent working on `web/` (Preact + TypeScript) and `apps-script/` (Google Apps Script, V8).
> **Purpose:** keep a fast-moving prototype *easy to change*. Shohel's feedback will reshape fields, screens and rules every round, and parts of this code (rules, operation format, tests) will be reused in the production app. SOLID is how we make that change cheap.
> **Stance:** pragmatic, not dogmatic. Apply SOLID where change is *expected* (entities, storage, API, reports). Do not add layers "just in case" (see §9). Every **MUST** below is checked in code review (§10).

---

## 1. The architecture these principles protect

```
 features/ (screens, hooks)          ← UI only; calls use cases; no I/O
        │
        ▼
 domain/  apply.ts · derive.ts · search.ts · entities/*   ← pure functions, no I/O, no globals
        │  (depends only on types + small ports)
        ▼
 ports/   ApiClient · OutboxStore · SnapshotStore · MetaStore · Clock · IdGenerator · Connectivity
        ▲
        │ implemented by
 infra/   api.ts (fetch) · idb.ts (IndexedDB) · browser.ts (Date, crypto, navigator.onLine)
        ▲
 main.tsx = composition root (the ONLY place that wires implementations to ports)
```

**Dependency rule:** arrows point inward. `domain` imports nothing from `features` or `infra`. `features` import `domain` and `ports` (types), never `infra`. Only `main.tsx` imports `infra`. The same shape exists in Apps Script: `Domain.gs` (pure) ← `Api.gs` (I/O via a `repo` object) ← `Code.gs` (wiring).

Folder layout (see the prototype prompt §6.2) maps to this:

| Folder / file | Layer | Single responsibility |
|---|---|---|
| `core/format.ts`, `core/parse.ts` | domain-support | Bangla/number/date formatting; input parsing |
| `data/apply.ts` | domain | Apply an operation to in-memory state |
| `data/derive.ts` | domain | Balances, totals, reports from state |
| `data/search.ts` | domain | Global search over state |
| `data/entities/*.ts` | domain | One file per entity: validate + apply + void rules |
| `sync/engine.ts` | application | Orchestrate push → snapshot → rebase |
| `sync/outbox.ts` | application | Queue rules (status transitions, backoff) |
| `sync/api.ts`, `data/idb.ts` | infra | Talk to the network / IndexedDB |
| `features/*` | UI | Screens and hooks per feature |
| `main.tsx` | composition | Build the object graph |

---

## 2. S — Single Responsibility Principle

> *A module should have one reason to change.* Ask: **"Who would ask me to change this?"** If the answer has two different people/reasons (UI wording *and* accounting rule), split it.

### Rules
- **MUST** separate: *transport* (`api.ts`), *persistence* (`idb.ts`), *state transitions* (`apply.ts`), *calculations* (`derive.ts`), *orchestration* (`engine.ts`), *presentation* (components).
- **MUST** keep components thin: a screen renders state and calls a hook/use case. Money maths, balance formulas and validation live in `domain`, not in JSX.
- **MUST** keep formatting (`৳`, Bangla digits) out of domain data: the domain stores integer paisa and ISO dates; only the UI layer formats.
- **SHOULD** treat as a review smell: a file > 300 lines, a function > 40 lines, a component with > 3 `useEffect`s, or any file whose name needs "and".
- **Apps Script:** `Domain.gs` has no `SpreadsheetApp`, `LockService` or `PropertiesService` calls; `Api.gs` does I/O and calls domain functions; `Setup.gs`, `Seed.gs`, `Backup.gs` are separate files with one job each.

### Example
```ts
// ❌ One function with four reasons to change (UI, validation, calculation, persistence)
async function savePayment(form: FormData) {
  const amount = parseFloat(form.get('amount') as string);          // parsing
  if (amount <= 0) alert('ভুল অঙ্ক');                              // UI + validation
  const outstanding = orders.reduce((s, o) => s + o.total, 0) - paid; // calculation
  await db.put('outbox', { ...form, outstanding });                  // persistence
}

// ✅ Each piece changes for exactly one reason
const amountPaisa = parseMoneyToPaisa(input);                   // core/parse.ts
const result = validatePayment(draft, state);                   // data/entities/payment.ts
const outstanding = outstandingFor(state, customerId);          // data/derive.ts
await saveOp.execute(buildCreateOp('payment', draft));          // use case → OutboxStore port
```

---

## 3. O — Open/Closed Principle

> *Open for extension, closed for modification.* Adding a new entity, report or payment method should be **adding a file or a data row**, not editing the sync engine or a 200-line `switch`.

### Rules
- **MUST** model each entity as a **handler registered in a registry**; `apply.ts`, the outbox and the sync engine never `switch` on entity names.
- **MUST** keep *enumerations that business may change* as **data**, not code: payment methods, expense categories, adjustment kinds, asset statuses live in one `constants` table (and the `ExpenseCategories` tab), consumed by UI chips and validators.
- **MUST** register reports in a list (`id`, Bangla title, `compute(state, range)`, `Component`); the Reports screen iterates the list.
- **MUST** mirror the same registry idea in Apps Script (`ENTITY_HANDLERS`).
- **MUST NOT** add `if (entity === 'x')` branches to shared code. If you feel the urge, add a method to the handler interface.

### Example
```ts
// data/entities/types.ts
export interface EntityHandler<TPayload = unknown> {
  readonly name: string;                         // 'payment'
  readonly editable: boolean;                    // money entities: false (append-only)
  validate(payload: TPayload, state: AppState): ValidationResult;
  create(state: AppState, op: Op<TPayload>): AppState;
  update?(state: AppState, op: Op<Partial<TPayload>>): AppState;   // only for editable entities
  void(state: AppState, op: Op<{ reason: string }>): AppState;      // includes cascades
}

// data/entities/registry.ts
const handlers = new Map<string, EntityHandler>();
export const register = (h: EntityHandler) => handlers.set(h.name, h);
export const handlerFor = (name: string) => {
  const h = handlers.get(name);
  if (!h) throw new UnknownEntityError(name);
  return h;
};

// data/apply.ts — closed for modification: never changes when a new entity appears
export function applyOp(state: AppState, op: Op): AppState {
  const h = handlerFor(op.entity);
  switch (op.op) {
    case 'create': return h.create(state, op);
    case 'update': if (!h.update) throw new NotEditableError(op.entity); return h.update(state, op);
    case 'void':   return h.void(state, op);
  }
}
```
```js
// apps-script/Domain.gs — same idea
const ENTITY_HANDLERS = {
  payment:  { editable: false, validate: validatePayment_, create: createPayment_, void: voidPayment_ },
  customer: { editable: true,  validate: validateCustomer_, create: createCustomer_, update: updateCustomer_, void: voidCustomer_ },
  // add a new entity here; applyOp_ never changes
};
```

### Worked example: "Shohel wants a *supplier* module" (touches only new code)
1. `data/entities/supplier.ts` — handler (validate/create/update/void) + `register(supplierHandler)` in `entities/index.ts`.
2. `Domain.gs` — add `supplier` to `ENTITY_HANDLERS`; `Setup.gs` — add the `Suppliers` tab definition (headers/formats).
3. `features/suppliers/` — list and form screens; add a route and a More-menu entry.
4. Tests: handler unit tests + the shared contract test (§4).
`engine.ts`, `outbox.ts`, `apply.ts`, `api.ts` are **untouched**. If they had to change, the design failed — fix the design.

---

## 4. L — Liskov Substitution Principle

> *Any implementation of an interface must be usable wherever the interface is expected, without surprising the caller.* No weaker guarantees, no new exceptions, no "not supported".

### Rules
- **MUST** define ports (`OutboxStore`, `SnapshotStore`, `ApiClient`, `Clock`, `IdGenerator`) with documented **contracts** (ordering, atomicity, idempotency, error types).
- **MUST** provide **two implementations** for every port that tests rely on: the real one (`IndexedDbOutboxStore`) and an in-memory fake (`MemoryOutboxStore`). **Both must pass the same contract test suite.** That suite is how we prove substitutability.
- **MUST NOT** use `instanceof`/type checks on implementations in consumers, and **MUST NOT** throw `NotImplemented`/`Unsupported` from an interface method.
- **MUST** preserve invariants in subtypes: e.g. a `Paisa` value is always a safe integer; a function accepting `Paisa` never receives a float.
- **Apps Script:** the real `SheetsRepo` and the in-memory `MemoryRepo` used by `selfTest()` must behave identically for `readAll`, `append`, `updateById`, `findById`.

### Example
```ts
// ports/OutboxStore.ts
export interface OutboxStore {
  /** Appends atomically; assigns a strictly increasing seq. Never reorders. */
  append(op: Op): Promise<void>;
  /** Oldest-first by seq. Returns at most `limit` ops with status 'pending'. */
  nextPending(limit: number): Promise<OutboxRecord[]>;
  /** Idempotent: setting the same status twice is a no-op. */
  setStatus(opId: string, status: OutboxStatus, info?: { error?: string }): Promise<void>;
  pendingCount(): Promise<number>;
}

// test/contract/outboxStore.contract.ts — run against EVERY implementation
export function outboxStoreContract(make: () => Promise<OutboxStore>) {
  it('returns pending ops oldest-first', async () => { /* … */ });
  it('setStatus is idempotent', async () => { /* … */ });
  it('append preserves seq order under concurrent calls', async () => { /* … */ });
}
// outboxStore.idb.test.ts  → outboxStoreContract(() => makeIndexedDbStore())   (fake-indexeddb)
// outboxStore.memory.test.ts → outboxStoreContract(() => Promise.resolve(new MemoryOutboxStore()))
```
**Smell:** a fake that is "simpler" than the real thing in a way tests silently depend on. If the contract passes for both, the fake is honest.

---

## 5. I — Interface Segregation Principle

> *Clients should not depend on methods they don't use.* Prefer several small, role-based interfaces over one big "Store" or "Api".

### Rules
- **MUST** split ports by role: `OutboxWriter` (UI save path) vs `OutboxReader`/`OutboxProcessor` (sync engine); `SnapshotReader` vs `SnapshotWriter`; `MetaStore` split into `SettingsStore` and `SecretStore` (token/PIN hash).
- **MUST** give each feature hook only what it needs. A screen that only saves an expense depends on `OutboxWriter` and `Clock`/`IdGenerator`, not on the sync engine or the API.
- **MUST NOT** pass a "god object" (`appContext`, `store`, `services`) down the tree. Inject specific dependencies via small hooks (`useOutboxWriter()`, `useSnapshot()`).
- **SHOULD** keep component props minimal and typed; avoid optional-prop explosions — split into two components instead.
- **Apps Script:** domain functions take the narrow `repo` capabilities they use (`repo.findById`, `repo.append`) — document the shape in a JSDoc typedef.

### Example
```ts
// ❌ Fat interface: the expense screen can now accidentally trigger sync or read the token
interface Services { api: ApiClient; db: Database; outbox: Outbox; meta: Meta; engine: SyncEngine; /* … */ }

// ✅ Segregated roles
export interface OutboxWriter { append(op: Op): Promise<void>; }
export interface OutboxProcessor { nextPending(n: number): Promise<OutboxRecord[]>; setStatus(id: string, s: OutboxStatus, i?: StatusInfo): Promise<void>; }
export interface SecretStore { getToken(): Promise<string | null>; setToken(t: string): Promise<void>; clear(): Promise<void>; }

// The IndexedDB class may implement several roles; consumers see only one
class IndexedDbOutbox implements OutboxWriter, OutboxProcessor { /* … */ }

// Feature code
export function useAddExpense(writer: OutboxWriter, ids: IdGenerator, clock: Clock) { /* … */ }
```

---

## 6. D — Dependency Inversion Principle

> *High-level policy must not depend on low-level details; both depend on abstractions.* Business rules shouldn't know about `fetch`, `indexedDB`, `Date.now()` or `SpreadsheetApp`.

### Rules
- **MUST** access **all** environment details through ports/injected functions:
  | Never call directly in domain/features | Use instead |
  |---|---|
  | `fetch`, `XMLHttpRequest` | `ApiClient` |
  | `indexedDB`, `localStorage` | `OutboxStore`, `SnapshotStore`, `SettingsStore` |
  | `Date.now()`, `new Date()` | `Clock` |
  | `crypto.randomUUID()`, `Math.random()` | `IdGenerator` |
  | `navigator.onLine`, `window.addEventListener('online')` | `Connectivity` |
  | `setTimeout` in sync logic | `Scheduler` |
  | `SpreadsheetApp`, `PropertiesService`, `LockService` (Apps Script domain code) | `repo`, `config`, `lock` objects passed in |
- **MUST** build the object graph in **one composition root** (`main.tsx`; `Code.gs` for Apps Script). Everything else receives dependencies via arguments, constructors or context hooks.
- **MUST** enforce the dependency rule mechanically: ESLint `no-restricted-imports` (or an import-boundaries plugin — verify the current option) so `domain/**` cannot import `infra/**`, `features/**` or browser globals; add `no-restricted-globals` for `fetch`, `indexedDB`, `localStorage`, `Date` in `domain/**` and `features/**`.
- **MUST** make time and randomness injectable so tests are deterministic (`FakeClock`, `SequentialIds`).

### Example
```ts
// ✅ Sync engine depends on abstractions only
export class SyncEngine {
  constructor(
    private readonly api: ApiClient,
    private readonly outbox: OutboxProcessor,
    private readonly snapshots: SnapshotStore,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly connectivity: Connectivity,
  ) {}

  async runOnce(): Promise<SyncSummary> { /* push → snapshot → rebase, no globals */ }
}

// main.tsx — the only place that knows the concrete classes
const engine = new SyncEngine(
  new FetchApiClient(config.apiUrl, secrets),
  indexedDbOutbox,
  indexedDbSnapshots,
  new SystemClock(),
  new BrowserScheduler(),
  new BrowserConnectivity(),
);

// engine.test.ts — fully deterministic, no browser, no network
const engine = new SyncEngine(new FakeApi(), new MemoryOutbox(), new MemorySnapshots(), new FakeClock(), new ManualScheduler(), new FakeConnectivity());
```
```js
// apps-script: domain gets its collaborators
function pushOps_(deps /* {repo, clock, ids, lock} */, ops) { /* pure orchestration over deps */ }
// Code.gs wires real ones; SelfTest.gs wires MemoryRepo + FakeClock
```

---

## 7. How the principles show up in the prototype's key flows

| Flow | S | O | L | I | D |
|---|---|---|---|---|---|
| **Save a payment** | Form → `validatePayment` → `OutboxWriter.append` | Payment is a registered handler | Any `OutboxStore` works | Screen sees `OutboxWriter` only | `Clock`/`IdGenerator` injected |
| **Sync** | `engine` orchestrates; `api` transports; `outbox` owns status rules | New entity needs no engine change | Fake API/outbox behave like real ones (contract tests) | Engine gets `OutboxProcessor`, not the writer | All ports injected |
| **Balances & reports** | `derive.ts` pure; formatting in UI | Reports registered in a list | n/a | Report components take `state` + `range` only | No I/O at all |
| **Apps Script push** | `Domain.gs` vs `Api.gs` vs `Setup.gs` | `ENTITY_HANDLERS` | `MemoryRepo` ≡ `SheetsRepo` | Narrow `repo` capabilities | `deps` object injected |

---

## 8. Testing is the proof

- **Domain tests (Vitest):** `applyOp`, `derive`, `search`, formatting/parsing — pure, fast, no mocks. Use the shared **golden vectors** (`testdata/balance_vectors.json`) in web tests **and** Apps Script `selfTest()`.
- **Contract tests:** one suite per port, run against real and in-memory implementations (LSP).
- **Engine tests:** deterministic with `FakeApi`, `MemoryOutbox`, `FakeClock`, `ManualScheduler`. Required scenarios: duplicate push, rejected op, network error + backoff, crash recovery (`syncing` → `pending`), dependency hold, rebase after snapshot.
- **Extensibility test (OCP):** a test registers a throw-away `dummy` entity and proves `applyOp`, the outbox and the engine process it **without modification**.
- **Boundary lint (DIP):** CI fails if `domain/**` imports `infra/**` or uses forbidden globals.

---

## 9. Pragmatism rules (avoid over-engineering the prototype)

1. **Abstract at seams that will change or must be faked:** network, storage, time, ids, entities, reports. **Don't** abstract UI styling, route definitions or one-off helpers.
2. **Rule of two:** create an interface only if there are (or will immediately be) two implementations — usually *real + test fake*. Otherwise use a plain function.
3. **No premature generics, no plugin frameworks, no dependency-injection libraries.** Constructor/argument injection and one composition root are enough.
4. **Prefer functions and plain objects over class hierarchies.** Classes are fine for stateful services (`SyncEngine`, stores). **No inheritance for reuse** — compose.
5. **Delete dead abstractions** after a feedback round if a seam turned out not to be needed.
6. **YAGNI beats SOLID** when they conflict *for features that are not in the prototype scope* (biometrics, multi-user, roles). Note them in `docs/UPGRADE_NOTES.md` instead.

---

## 10. Code-review checklist (copy into the PR template)

**S** — Does each new file/function have one reason to change? No money maths or validation inside components? Formatting only in UI?
**O** — Could this feature have been added without editing existing shared code? No new `if (entity === …)` / long `switch`? Business enumerations are data?
**L** — Does every new port implementation pass the contract suite? No `instanceof`, no `NotImplemented`, no weakened guarantees?
**I** — Does the consumer depend only on the small interface it uses? No god objects passed around? Props minimal?
**D** — No `fetch`/`indexedDB`/`Date`/`crypto`/`localStorage`/`SpreadsheetApp` in domain or features? Dependencies wired only in the composition root? Time and ids injectable?
**General** — Tests added (domain + contract/engine where relevant)? Security rules in `SECURITY.md` still satisfied (validation, text sanitising, no secrets in logs)? Docs/ADR updated?

**Red flags (block the PR):** a screen importing `api.ts` or `idb.ts`; `Date.now()` in `derive.ts`; a new entity requiring edits in `engine.ts`; a fake store that skips behaviour the real one has; a `utils.ts` growing unrelated functions; copy-pasted validation between client and Apps Script without a shared test vector.

---

## 11. Companion rules (short)

- **DRY with judgement:** share *rules* (balance formulas, validation constants, golden vectors), not accidental similarity. Client and Apps Script can't share code at runtime, so they share **test vectors** and keep rules in clearly named pure functions on both sides.
- **KISS:** the simplest design that passes the tests and respects the dependency rule.
- **Law of Demeter:** components talk to hooks/use cases, not to `engine.api.client.fetch`.
- **Naming:** domain terms in code match the business words (customer, order, memo, payment, outstanding, recovery, void); Bangla only in strings files.
- **Immutability in the domain:** `applyOp` returns new state; never mutate the snapshot in place.
- **Errors as values at boundaries:** validation returns `{ok:false, code}` (codes map to Bangla messages); exceptions are for programmer errors.
- **Document decisions:** every deliberate deviation from this file gets a short ADR in `docs/adr/`.
