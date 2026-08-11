# Crown CRM → Electron.js Rewrite Plan (Local Windows, Offline-First)

- **Status:** Proposed (awaiting senior review)
- **Target platform:** Windows 10/11, x64, fully offline (no internet required)
- **Decisions confirmed:** React 19 + TypeScript, SQLite via `better-sqlite3`, single local admin login (re-login required on every launch — no persisted session), single (flattened) organization, fresh-start data, `webContents.printToPDF` for receipts, manual installer updates, signed (OV cert) NSIS-only installer, no telemetry, Celery/Redis dropped.

---

## 1. Research Summary

Key findings from 2026 Electron.js research that drive this plan:

- **Two-process model:** Electron apps have one Node.js **main process** (lifecycle, database, filesystem, native modules) and isolated **renderer** processes (UI in Chromium). Business logic belongs in main; the renderer is a thin UI layer. Recommended layout: `src/main`, `src/renderer`, `src/preload`, `src/common`. (oflight.co.jp architecture guide, LogRocket advanced-architecture, electronjs.org process-model)
- **IPC security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; expose only a whitelisted API via `contextBridge`; validate every payload in main with typed schemas; prefer `ipcRenderer.invoke` / `ipcMain.handle` (Promise-based). (edana.ch, developers-heaven.net, LogRocket)
- **SQLite:** `better-sqlite3` is the de-facto standard driver — fastest synchronous API, WAL mode, `foreign_keys = ON`. It is a native module and must be rebuilt against Electron's Node ABI via `electron-builder install-app-deps` (which wraps `@electron/rebuild` — the maintained successor to the deprecated `electron-rebuild`). SQLite runs **only in the main process**; the renderer talks to it exclusively over IPC. (rxdb.info, truetech.dev, sqg.dev benchmarks)
- **Offline PDF:** Electron's built-in `webContents.printToPDF()` is the right tool — zero dependencies, runs offline, reuses HTML/CSS. Gotchas: `printBackground: true`, `print-color-adjust: exact`, bundle fonts via `@font-face`, await `document.fonts.ready`. (pdf4.dev guide, 2026)
- **Packaging:** `electron-builder` with NSIS for a Windows `.exe` installer. Target only `win32-x64`. (edana.ch, forasoft 2026)
- **Performance:** React `memo`, TanStack Query caching (replaces HTMX partial-refresh semantics), lazy route loading to keep memory low. (clouwood, edana.ch)
- **Electron support cadence:** only the last three Electron majors receive security fixes; pin and budget upgrades (≈2–4 engineer-days per major). (forasoft 2026)

---

## 2. Decisions

| Decision                    | Choice                                                                             | Rationale                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                   | React 19 + TypeScript, bundled with **electron-vite**                              | Largest ecosystem, type-safe IPC contracts, best Electron support                                                                                                                         |
| Database                    | SQLite via **better-sqlite3** (WAL, FK on)                                         | Fastest, mature, embedded, zero-server. Only native module                                                                                                                                |
| Auth                        | Single local admin login, scrypt-hashed                                            | "Some auth" for a local machine; scrypt is built into `node:crypto` (zero extra native deps)                                                                                              |
| Tenancy                     | **Flattened** to a single organization (the gym)                                   | Single Windows machine; removes slug routing + membership complexity                                                                                                                      |
| Data                        | **Fresh start**                                                                    | No migration tool; existing `db.sqlite3` is discarded                                                                                                                                     |
| PDF                         | `webContents.printToPDF`                                                           | Built-in, offline, reuses HTML/CSS template                                                                                                                                               |
| Background jobs             | **Celery/Redis dropped entirely**                                                  | PDF + expiry checks are synchronous in main — no queue needed                                                                                                                             |
| Packaging                   | `electron-builder` → NSIS installer, win32-x64                                     | Standard, offline installable                                                                                                                                                             |
| Money storage               | **Integer cents**                                                                  | Avoids float rounding errors in accounting (improvement over Django `Decimal` via SQLite REAL)                                                                                            |
| Auth state                  | Main-process boolean, **no persisted session — re-login required on every launch** | Single-machine app has no stateless-request problem to solve; drops session-table plumbing (Module 3)                                                                                     |
| Updates                     | **Manual NSIS installer reinstall**; `electron-updater` deliberately unused        | Auto-update needs a network-accessible update server, violating the offline constraint (Module 14)                                                                                        |
| Code signing                | **OV code-signing certificate; signed installer**                                  | Unsigned installers trigger SmartScreen "unknown publisher" blocks and increasingly aggressive AV heuristics — unacceptable for gym staff who reinstall manually every update (Module 12) |
| Renderer CSP                | **Pinned `<meta>` CSP** in `index.html`                                            | Cheap insurance against renderer XSS via user-entered data; pinned concretely, same discipline as the IPC schemas (Module 2)                                                              |
| Crash reporting / telemetry | **None — offline only**; `electron-log` + manual support                           | Stated decision so it surfaces in support conversations; Sentry-style offline-queue patterns deliberately dropped (Module 11)                                                             |
| Portable build              | **Dropped — NSIS only**                                                            | Portable target uses an app-relative `userData`, diverging from the NSIS path and creating data/backup ambiguity (Module 12)                                                              |

---

## 3. Django → Electron Concept Mapping

| Django concept                                      | Electron replacement                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `BaseModel` (uuid PK, created/updated, soft-delete) | Convention in every SQL table + `createRow`/`softDelete` repository helpers                         |
| ORM / `models.py`                                   | Raw SQL repositories in the main process (no ORM — simple, reviewable)                              |
| HTMX partials + `trigger_client_event`              | TanStack Query `useQuery`/`useMutation` + `invalidateQueries` (same "refresh this table" semantics) |
| Templates (django-cotton, crispy forms)             | React components (ports of `templates/cotton/` and partials)                                        |
| `organization_slug_required` + queryset scoping     | Not needed (single org); repositories receive `db` directly                                         |
| allauth login/signup/email-verify                   | Local login screen + "Create admin" first-run screen                                                |
| django-tables2 + pagination                         | `@tanstack/react-table` (or hand-rolled sortable tables)                                            |
| django-filter                                       | Client-side filtering in table components                                                           |
| Celery `generate_receipt_pdf`                       | Synchronous `printToPDF` in the main process                                                        |
| WeasyPrint `templates/pdfs/receipt.html`            | Ported HTML/CSS rendered in a hidden `BrowserWindow`                                                |
| django-redis / cache                                | In-memory only (TanStack Query)                                                                     |
| Django admin                                        | Not needed (all features live in the UI)                                                            |

---

## 4. Target Repository Layout

```
crm-electron/                    # NEW repo (recommended) or new top-level folder
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── build/                       # icons, installer assets, bundled fonts
└── src/
    ├── common/                  # shared types + zod schemas + IPC channel names (the contract)
    ├── main/
    │   ├── index.ts             # app lifecycle, single-instance lock, window management
    │   ├── db/
    │   │   ├── connection.ts    # better-sqlite3 init, WAL pragma, schema_migrations
    │   │   ├── migrations/      # versioned .sql files (0001_init.sql, ...)
    │   │   └── repositories/    # leads.ts, clients.ts, memberships.ts, receipts.ts, ...
    │   ├── services/
    │   │   ├── auth.ts          # scrypt hash/verify, in-memory auth state
    │   │   ├── receipt.ts       # receipt-number generation, balance snapshots
    │   │   ├── pdf.ts           # printToPDF wrapper + receipt template
    │   │   └── backup.ts        # db.backup() to a user-chosen folder
    │   ├── ipc/                 # registerIpcHandler(schema, fn) registry per feature
    │   └── windows/             # main window, hidden PDF window
    ├── preload/
    │   └── index.ts             # contextBridge → window.api
    └── renderer/
        └── src/
            ├── main.tsx, App.tsx
            ├── router.tsx       # react-router (login, dashboard, leads, clients, accounting, logistics, settings)
            ├── lib/api.ts       # typed window.api wrapper
            ├── lib/query.ts     # TanStack Query setup
            ├── features/        # dashboard/ leads/ clients/ accounting/ logistics/ settings/
            └── components/      # shared: DataTable, Modal, FormField, Toaster, ConfirmDialog
```

---

## 5. Module-Wise Plan

### Module 0 — Scaffold & build tooling

**Effort: 2 days**

- Initialize with `npm create @quick-start/electron` (electron-vite template), React + TypeScript variant.
- Pin versions at implementation time (Electron 3x current stable; check the supported train before choosing).
- Dependencies: `electron`, `electron-vite`, `vite`, `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `zod`, `better-sqlite3`, `electron-builder`, `electron-window-state`.
- Postinstall rebuilds the native module against Electron's ABI. Note: the `electron-rebuild` npm package is **deprecated** ("Please use @electron/rebuild moving forward"); `electron-builder install-app-deps` wraps `@electron/rebuild` (the maintained successor, no API change) and stays in sync with the packaging tool's own rebuild logic:

```jsonc
// package.json
"scripts": {
  "postinstall": "electron-builder install-app-deps"
}
```

- **Offline rule:** no CDN. All assets — Bootstrap 5 (from the `bootstrap` npm package), Chart.js, fonts — are bundled into the installer.

```ts
// electron.vite.config.ts (essentials)
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {},
  renderer: {
    plugins: [react()],
    build: { rollupOptions: { input: "src/renderer/index.html" } },
  },
});
```

---

### Module 1 — Database layer (main process)

**Effort: 3 days**

- Connection setup with required pragmas:

```ts
// src/main/db/connection.ts
import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import { runMigrations } from "./migrations";

export const db = new Database(path.join(app.getPath("userData"), "crm.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
runMigrations(db);
```

- **Migration runner** — versioned `.sql` files + `schema_migrations` table, each run inside a transaction (replaces Django migrations):

```ts
// src/main/db/migrations/index.ts
export function runMigrations(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);
  for (const { name, up } of migrations) {
    const done = db
      .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
      .get(name);
    if (!done) {
      db.transaction(() => {
        db.exec(up);
        db.prepare(
          "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
        ).run(name, new Date().toISOString());
      })();
    }
  }
}
```

- **Pre-migration backup:** before any pending migration runs on launch, the existing `crm.db` is copied to `userData/backups/pre-migration-<version>-<timestamp>.db` using the same `db.backup()` primitive as Module 11. Migrations are **forward-only** and each file is transactional, so it cannot half-apply; if a new version still fails to launch, the documented rollback is restore-that-backup + reinstall the previous version (Module 14).

- **Money handling:** store amounts as **integer cents** (`price_cents`, `amount_cents`, `opening_balance_cents`, `closing_balance_cents`). Port a `formatMoney(cents, locale)` util to the renderer. Avoids float errors in accounting.

- **Schema** (flattened, soft-delete everywhere, TEXT uuid PKs mirroring Django `BaseModel`):
  - `admin_user`, `audit_log` (no `session` table — auth is an in-memory flag, see Module 3)
  - `app_settings` (single-gym info: name, logo path, address, mobile, email)
  - `leads` + `lead_mobile_numbers` / `lead_email_addresses` / `lead_addresses` / `lead_discussion_history` / `lead_sources` / `lead_followups`
  - `clients` + `client_mobile_numbers` / `client_email_addresses` / `client_body_measurements` / `client_body_statuses` / `client_addresses`
  - `memberships`, `receipts` (+ `pdf_path`, `pdf_generated_at`)
  - `categories`, `services`, `products`, `inventory`

- **Repository pattern** per domain — thin, transaction-aware, returns plain objects:

```ts
// src/main/db/repositories/leads.ts
export const leadRepo = {
  list(db, { search, status, page, pageSize }) { /* prepared statements + pagination */ },
  get(db, id) {
    return db.prepare('SELECT * FROM leads WHERE id = ? AND is_deleted = 0').get(id)
  },
  create(db, input) {
    // insert lead + mobile/email rows inside one transaction
  },
    softDelete(db, id) {
      // set is_deleted = 1, cascade soft-delete memberships and receipts
      // (port of LeadMaster.delete)
    },
  },
}
```

- **Entity relationships (resolved against the Django source):** in `crown_crm/accounting/models.py`, `MembershipSale.lead` is a FK to `LeadMaster` — so **memberships belong to leads**, and receipts belong to memberships. `clients` (`ClientMaster`) is a separate tracking entity with no lead→client conversion flow wired. The FK chain is `leads ← memberships ← receipts`; therefore soft-deleting a lead **does** cascade to memberships and receipts (a faithful port of `LeadMaster.delete()`), and `clients` soft-delete cascades only within the client tree. Module 6's cascade statement is consistent with this.

- **Performance ceiling (stated assumption):** `better-sqlite3` is synchronous on the main-process thread, so any slow query stalls the whole window, not just itself. We design for **≤ 100k leads and ≤ 500k receipts**, with indexes on every FK and on the hot filters (`is_deleted`, `status`, `membership_end_date`, `sale_id + date`), targeting **< 50 ms per query**. Repository functions keep this contract. If real data grows past the ceiling, the escape hatch is offloading heavy reads to a `worker_threads` pool without changing repository signatures (out of scope for v1).

---

### Module 2 — IPC contract, security & envelope

**Effort: 2 days**

- One source of truth in `src/common/contract.ts`: IPC channel names + zod schemas shared by main and preload.

```ts
// src/main/ipc/registry.ts
export function registerIpc<In, Out>(
  name: string,
  schema: z.ZodType<In>,
  fn: (ctx: { db: Database.Database; user: AdminUser }, input: In) => Out,
) {
  ipcMain.handle(name, async (event, raw) => {
    try {
      const parsed = schema.parse(raw);
      return {
        ok: true as const,
        data: fn({ db, user: getUserFor(event) }, parsed),
      };
    } catch (e) {
      return { ok: false as const, error: toError(e) };
    }
  });
}

// usage:
registerIpc("leads:create", CreateLeadSchema, (ctx, d) =>
  leadRepo.create(ctx.db, d),
);
```

- `BrowserWindow` webPreferences: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and **`webSecurity: true` (the default is kept; never flipped during debugging)**.
- **Pinned CSP** `<meta>` in `index.html`:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'`
  (`'unsafe-inline'` for styles is required by Bootstrap's inline style attributes; scripts and objects are locked to `'self'`.)
- **Navigation hardening:** on every window — `win.webContents.on('will-navigate', e => e.preventDefault())` and `win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` — blocking external navigation and denying new-window creation from any pasted/rendered content (e.g., a URL typed into a lead address or notes). Applies to the main window and the PDF window.
- **Preload** exposes a typed, namespaced API; the renderer never sees raw channel strings:

```ts
// src/preload/index.ts
const api = {
  auth: {
    login: (email, password) =>
      ipcRenderer.invoke("auth:login", { email, password }),
    logout: () => ipcRenderer.invoke("auth:logout"),
    me: () => ipcRenderer.invoke("auth:me"),
  },
  leads: {
    list: (params) => ipcRenderer.invoke("leads:list", params),
    create: (data) => ipcRenderer.invoke("leads:create", data),
    // ...
  },
  // ...
};
contextBridge.exposeInMainWorld("api", api);
```

- Auth guard: every handler checks the main-process `authenticated` flag (Module 3); unauthenticated calls return `{ ok: false, error: 'UNAUTHORIZED' }`, and the renderer redirects to `/login`. The `user` in the handler context comes from the auth service's current admin — there is no session token to resolve.

---

### Module 3 — Auth (single admin, local)

**Effort: 2 days**

Product decision (made explicit): this is a single-machine, single-admin app, so authentication is a **main-process boolean flag**, not a web-style session. **On every app launch the password is required again** (default, secure for a shared counter computer). "Stay signed in across restarts" is deliberately NOT in v1 — that would be the only reason to persist a session to disk, and a local single-user app gains nothing from it.

- **First run:** no `admin_user` rows → renderer shows "Create Admin Account" (name / email / password / confirm).
- Hashing via Node built-in `crypto.scrypt` (memory-hard, zero extra native deps). `scrypt` is **callback-based, not Promise-based** — `await scrypt(...)` directly would not work — so it is wrapped in a Promise here (equivalent to `util.promisify`). Cost parameters are **set explicitly, not left at Node's defaults** (`N = 2**17` ≈ 128 MB memory, `r = 8`, `p = 1`), because this hash is the single gate for the whole app's access control:

```ts
// src/main/services/auth.ts
import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_OPTS = { N: 2 ** 17, r: 8, p: 1 }; // ~128 MB memory — explicit, not Node defaults
const KEYLEN = 64;

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    nodeScrypt(password, salt, KEYLEN, SCRYPT_OPTS, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(
  pw: string,
): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(pw, salt);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(
  pw: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await scrypt(pw, salt);
  return timingSafeEqual(Buffer.from(expectedHash, "hex"), actual);
}
```

- Login flow: verify the hash, then set an in-memory `authenticated = true` on the auth service. No `session` table, no persisted tokens (removed from the Module 1 schema). Logout clears the flag.
- Optional auto-lock on window idle (setting): clears the flag after N minutes and shows the lock screen. **In-flight IPC:** the `authenticated` flag is read only at handler entry (inside `registerIpc`); a request that already passed the guard completes even if the lock fires mid-execution, and anything queued after the lock is rejected. The window between lock and renderer redirect is at most one already-queued mutation — acceptable for a single-admin local app, since the guard runs at the one place data crosses into main.
- Every mutating action writes an `audit_log` row (user, action, entity, detail, timestamp) — the only auth-related table. **The audit-log write happens inside the same SQLite transaction as the mutation it records**, so a crash mid-write can never produce a mutation without its audit trail (or an audit row for a rolled-back mutation).

---

### Module 4 — App shell & navigation

**Effort: 3 days**

- Port `templates/base.html` layout → `AppShell` (sidebar + navbar from `partials/_sidebar.html`, `partials/_navbar.html`, `partials/_footer.html`) with Bootstrap 5 + the CSS ported from `static/`.
- `react-router` routes: `/login`, `/` (dashboard), `/leads`, `/leads/:id`, `/clients`, `/clients/:id`, `/accounting/sales`, `/accounting/sales/:id`, `/accounting/receipts`, `/accounting/receipts/:id`, `/logistics/services`, `/logistics/products`, `/settings`.
- TanStack Query provider + `lib/api.ts` wrapper; a global Toaster replaces the HTMX `message` toast events.
- Routes lazy-loaded (`React.lazy`) for startup performance.

---

### Module 5 — Dashboard & reports

**Effort: 2 days**

- Port `organization_dashboard_view` + `hx_lead_chart_data`: counts (total leads, 30-day leads), 7-day lead-trend chart (Chart.js via `react-chartjs-2`, local bundle), last-7-days sales.
- Port these table views as query-driven components:
  - `hx_recent_membership_sales_table`
  - `hx_membership_expirations_table` (60-day window)
  - `hx_outstanding_payments_table` (annotated `total_paid` / `balance`, fully-paid excluded)

---

### Module 6 — Leads module

**Effort: 6 days**

Port of `leads/views.py` + templates:

- **List & search:** `all_leads` page, `search_results_view` (first/middle/last name + mobile + email `icontains`, distinct, paginated), sortable/paginated `hx_leads_table`.
- **CRUD:** create with **dynamic mobile/email rows** (replaces `inlineformset_factory` + `hx_add_mobile_formset_input`); edit; soft-delete cascading to memberships/receipts (FK chain `leads ← memberships ← receipts` — resolved in Module 1).
- **Segmented tables:** `hx_leads_without_membership_table` and `hx_leads_with_membership_table` (`Exists` annotation → LEFT JOIN in the repo).
- **Detail page:** mobile/email tables with inline add/delete, address, discussion history, sources, follow-ups (`LeadFollowUp`: channel/status/`mark_completed`), memberships list.
- **Quick-create modal** shared with the sale form (`LeadCreateModal` component).
- Validation mirrors Django: 10-digit mobile regex, 6-digit pincode, email format → zod schemas in `src/common/contract.ts`.

---

### Module 7 — Clients module

**Effort: 4 days**

- `client_list`, `client_detail`, create (mobiles/emails formsets → dynamic rows), soft-delete.
- Port `ClientBodyMeasurementMaster` / `ClientBodyStatusMaster` (height, weight, ideal body weight, protein calculations) and `ClientAddressMaster`.

---

### Module 8 — Accounting (memberships + receipts + PDF) — the core

**Effort: 10 days**

- **Membership sale create** (`HxCreateMembershipSaleView`): atomic sale + first receipt; port pricing logic (`base_price`, `price`, `discount_percentage` calculation) and duration codes; auto-compute `membership_end_date` for preset durations; manual date for custom duration.
- **Receipt number** (`PaymentReceipt._generate_receipt_number`): `YY/MM/DD-duration_code-count` → port to `services/receipt.ts`. **Collision-safe:** `count` is the org-level count of non-deleted receipts, read **and** the new row inserted **inside the same SQLite transaction** — the `SELECT`/`INSERT` pair is never split across separate transactions, so rapid double-creates (double-click, future multi-window) cannot mint duplicate numbers. (In Django the count+save were already inside `transaction.atomic()`; the port keeps that invariant explicit.)
- **Balance snapshots** (`PaymentReceipt.save` + `MembershipSale.update_balance_snapshots`): opening/closing balance on create; recompute subsequent snapshots when an amount is edited; overpayment validation → a single transaction in `receiptRepo.upsert`. This is the most state-dependent logic in the app — a bug here shows wrong money on a printed receipt — so the algorithm and its test matrix are pinned below. **Complexity is O(receipts per membership)**, replayed from receipt #1 for one sale — not O(total org receipts) — so the 500k ceiling in Module 1 does not apply to this loop; a membership realistically has a handful of receipts.
- Pay-balance, edit/delete receipt (soft-delete), sale payment-history timeline + payment-summary partials. **Soft-delete and recompute:** soft-deleting a receipt removes it from the chain — `updateBalanceSnapshots` reads only `is_deleted = 0` rows, and the delete operation runs the recompute in the same transaction, so remaining snapshots are corrected immediately. Cascading deletes (lead → membership → receipts) trigger one recompute per affected sale before the transaction commits; no row is left carrying stale "current" balances.

- **Balance-snapshot recomputation — algorithm (pinned for review):**

```ts
// src/main/services/receipt.ts — runs inside a single SQLite transaction
export function updateBalanceSnapshots(tx, membershipId) {
  // 1. Re-read the authoritative sale price (target = price_cents).
  const price = tx.selectSalePrice(membershipId);
  // 2. Load ALL non-deleted receipts ordered by (date, created_at) ascending.
  const receipts = tx.listReceiptsAscending(membershipId);
  let running = price;
  for (const r of receipts) {
    // 3. Overpayment guard — must throw BEFORE any write for this row.
    //    Thrown inside db.transaction() → the whole call rolls back (zero partial writes).
    if (r.amountCents > running) {
      throw new OverpaymentError(r.id, r.amountCents, running);
    }
    r.openingBalanceCents = running;
    running -= r.amountCents;
    r.closingBalanceCents = running;
    // 4. If this receipt's snapshots changed (amount edited, or history shifted),
    //    any already-printed PDF for it is now wrong → invalidate it (see stale-PDF policy).
    //    `old` is null for a receipt created inside this same transaction — nothing to clear.
    const old = tx.currentSnapshots(r.id);
    if (
      old &&
      (old.openingCents !== r.openingBalanceCents ||
        old.closingCents !== r.closingBalanceCents)
    ) {
      tx.clearPdfMetadata(r.id); // pdf_path = NULL, pdf_generated_at = NULL
    }
    tx.updateBalances(r); // single prepared UPDATE
  }
  // Invariants (asserted in unit tests, not in production):
  //   first.opening == price
  //   r.closing == next(r.opening)          — chain is continuous, nothing skipped
  //   last.closing == price − Σ amounts     — equals the balance shown in the UI
  //   running never goes negative           — enforced by the OverpaymentError above
}
```

Rules carried over from the Django port (`PaymentReceipt.save` + `MembershipSale.update_balance_snapshots`):

- Create → compute from the current balance, no cascade needed.
- Edit/delete anywhere in the history → re-run the full cascade forward from the oldest receipt, in one transaction.
- Overpayment (amount > remaining balance) → rejected inside the same transaction by the guard in the loop (step 3); `running` can never go negative.
- Math is integer-cents only.

- **Receipt-number immutability (decided):** `date` is baked into the receipt number (`YY/MM/DD-duration_code-count`) at creation, so editing `date` after the number is assigned would make the identifier and the record disagree on a financial document. Rule: **once a receipt has a `receipt_number`, its `date` is read-only in the UI and rejected by validation.** The correction path is the already-supported soft-delete + recreate, which produces a fresh, consistent number. Amount edits remain allowed — they never touch the number — and are exactly what the balance-snapshot recompute exists to handle.

- **Stale-PDF policy (decided):** any recompute that changes a receipt's opening/closing snapshot clears its `pdf_path`/`pdf_generated_at` (step 4), so the UI can visibly flag "PDF out of date — regenerate" instead of silently leaving a file on disk that opens fine and shows wrong numbers. Because date edits on numbered receipts are disallowed, the only history-changing operations are amount edits and deletes — both covered by the same rule. The PDF window (Module 8) already re-renders from current snapshots, so regeneration is a re-run of the same `generateReceiptPdf` call.

- **Balance-snapshot unit-test matrix (must pass before Module 8 closes):**

| Scenario                                            | Expected                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Single receipt                                      | opening == price, closing == price − amount                                                                                  |
| Several receipts, in order                          | chain invariant holds end to end                                                                                             |
| Edit a middle receipt's amount down                 | every later closing shifts by the delta; none skipped                                                                        |
| Edit a middle receipt up past the remaining balance | rejected, zero partial writes                                                                                                |
| Delete a middle receipt                             | cascade recomputes forward; totals match                                                                                     |
| Edit → delete → re-add in sequence                  | idempotent: recomputing twice yields identical rows                                                                          |
| Receipt clears the full balance                     | closing == 0; no further receipt accepted                                                                                    |
| Edit a middle receipt's amount                      | later receipts whose snapshots shifted have `pdf_path`/`pdf_generated_at` cleared                                            |
| Edit a middle receipt's amount                      | earlier receipts whose snapshots are unchanged keep their `pdf_path`/`pdf_generated_at` (guards against over-eager clearing) |
| Edit a numbered receipt's `date`                    | rejected by validation — the number encodes the creation date; correction path is soft-delete + recreate                     |
| Overpayment via edit                                | throws `OverpaymentError`; whole transaction rolls back; no rows written                                                     |

- **PDF** (`services/pdf.ts`) — the `printToPDF` flow:

```ts
// src/main/services/pdf.ts
export async function generateReceiptPdf(
  receipt: Receipt,
  org: AppSettings,
): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      preload: path.join(__dirname, "pdf-preload.js"),
    },
  });
  await win.loadFile(path.join(process.resourcesPath, "pdfs/receipt.html"));
  win.webContents.send("pdf:data", { receipt, org }); // IPC — structured, not string-built
  await win.webContents.executeJavaScript("document.fonts.ready"); // fonts only; no customer data here
  const buf = await win.webContents.printToPDF({
    pageSize: "A4",
    printBackground: true,
  });
  const out = path.join(
    app.getPath("userData"),
    "receipts",
    `receipt-${receipt.receiptNumber}.pdf`,
  );
  await writeFile(out, buf);
  win.destroy();
  return out;
}
```

```js
// src/main/windows/pdf-preload.js — minimal, separate from the app preload
const { contextBridge, ipcRenderer } = require("electron");
let payload = null;
ipcRenderer.on("pdf:data", (_e, data) => {
  payload = data;
});
contextBridge.exposeInMainWorld("receiptBridge", { getData: () => payload });
```

- **Why not string-built JS:** `JSON.stringify` output can legally contain the Unicode line/paragraph separators U+2028/U+2029 — valid inside JSON strings but line terminators in raw JS source. Embedding it in an `executeJavaScript` template literal would silently break mid-statement, and only with real customer data (names, addresses, notes), never in clean sample data. The preload + `webContents.send` channel above eliminates that class of bug. The PDF window gets `sandbox: true` and its own minimal preload; `executeJavaScript` is used only for `document.fonts.ready`.
- Fallback if the IPC channel is ever bypassed: escape before injection — `JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')`. The IPC channel is the primary design.
- Port `templates/pdfs/receipt.html` to a self-contained file with bundled fonts (`@font-face` local path) and `print-color-adjust: exact`. UI offers "Open PDF / Save As". **The template renders every user-entered field (name, address, notes) via `textContent`/text nodes — never `innerHTML`/`insertAdjacentHTML` with unsanitized fields** — so a pasted `<script>` in a note stays inert text inside the `sandbox: true` PDF window.
- The dormant Celery path is dropped entirely (synchronous generation is fast enough locally).

---

### Module 9 — Logistics (services, products, inventory)

**Effort: 4 days**

- `CategorySP`; `Service` (type sessions/subscription, validation ported from `Service.clean`); `Product` (sku/hsn); `Inventory` (quantity/location/last update).
- List / detail / inline-edit pages, create/edit/delete modals, table partials → React components.

---

### Module 10 — Settings (single org)

**Effort: 2 days**

- Replace org settings: gym name, logo (file picker → copied into `userData`), address, mobile, email; password change; backup settings; expiry-notification threshold.
- Logo referenced by absolute local path (no `build_absolute_uri`).

---

### Module 11 — Local infrastructure

**Effort: 2 days**

- `app.requestSingleInstanceLock()`; on second launch, focus the existing window and **ignore any command-line args** (no file association exists in v1; a future "open with" handler forwards the path to the running instance over IPC instead).
- Backups: `db.backup(dest)` on explicit "Backup now" plus optional auto-backup on clean shutdown to a user-chosen folder. Also used automatically before migrations (Module 1).
- Logging: `electron-log` (pure JS, offline) to `userData/logs`.
- Error handling: `process.on('uncaughtException'...)`, renderer `ErrorBoundary`, IPC errors surfaced as toasts.
- Window state persistence: remember size/position across launches via `electron-window-state`, which **debounces** writes to `userData/window-state.json` internally. No other component writes to disk on a per-keystroke/per-frame basis — audit-log and balance writes go through SQLite (batched by WAL), backups only on explicit action or shutdown — so the main thread's synchronous work stays within the Module 1 query budget.

---

### Module 12 — Packaging (Windows)

**Effort: 2 days**

- `electron-builder.yml`: `win: { target: ['nsis'] }`, `arch: [x64]`, `appId`, `productName: "Crown CRM"`, `asar: true`, icon assets, `extraResources` for `pdfs/receipt.html` + fonts.
- **Code signing (decided):** purchase an **OV (Organization Validation) code-signing certificate** and sign the installer. Required, not a nice-to-have: an unsigned installer triggers SmartScreen's "unknown publisher" block and is increasingly flagged by 2026 AV heuristics — and since updates are manual reinstalls, gym staff would hit that on every update. Note: since 1 March 2026 Windows certificates expire after ~460 days; schedule renewal ahead of expiry.
- **Native-module build (decided):** rely on `better-sqlite3` **prebuilt binaries** (`prebuild-install`, run by `electron-builder install-app-deps`); MSVC build tools are **not** required on the dev machine. If no prebuild exists for the pinned Electron ABI, the fallback is a one-time `@electron/rebuild` on a machine with MSVC — an explicit rare action, not a standing requirement.
- **Portable target dropped** (NSIS only) — avoids the separate app-relative `userData` location portable builds use, keeping the database and backup story single and unambiguous.
- Deliverable: signed NSIS installer `.exe` installable on a fully offline machine.

---

### Module 13 — Testing

**Effort: 3 days**

- `vitest`: unit tests for repositories (temp SQLite file), receipt-number logic, the **balance-snapshot test matrix from Module 8**, auth hash/verify (incl. cost-parameter smoke + `timingSafeEqual` path), zod schemas.
- `@playwright/test` + Electron E2E: first-run admin creation, login, create lead, create membership + receipt, generate PDF, soft-delete cascade.
- Manual Windows smoke checklist: install (signed), first-run admin, backup, offline boot.
- **QA/hardening buffer:** add **3–5 days** of contingency across Modules 0–12 for the named first-time risks — codesign setup/renewal, AV false-positive triage on a fresh signed build, and the `better-sqlite3` prebuilt-binary fallback on Windows.

---

### Module 14 — Cutover runbook

**Effort: 1 day**

- Fresh-start confirmed → no data migration. Runbook: install the `.exe`, create the admin, re-enter gym settings; archive the old Django repo (keep for reference until v1 is validated).
- **Update strategy (decided):** updates ship as a **manual reinstall of the NSIS installer**. `electron-updater` (auto-update / differential NSIS) is deliberately not used — it requires a network-accessible update server, which violates the offline constraint. Reinstalling over an existing install preserves `userData` (the database lives outside `app.asar`). The Settings page shows the app version so the running build is identifiable. **Rollback story:** migrations are forward-only and transactional per file (Module 1); before any pending migration runs, `crm.db` is auto-copied to `userData/backups/pre-migration-<version>-<timestamp>.db`. If a new version fails to launch, the operator restores that backup and reinstalls the previous installer. No schema-downgrade path is provided — restore + reinstall is the documented escape hatch.

---

## 6. Recommended Build Order (for review)

`M0 → M1 → M2 → M3` (walking skeleton: first-run admin → login → empty shell) → **M8 core accounting** → M6/M7 → M9 → M5/M10 → M11 → M12.

Package the app (Module 12) at the end of each vertical slice so it is testable on a real Windows machine early.

---

## 7. Risks / Open Items

1. **better-sqlite3 native module** — mitigated by decision: rely on prebuilt binaries via `prebuild-install` (no MSVC on the dev machine). Residual risk: a missing prebuild for the pinned Electron ABI, which needs a one-time local `@electron/rebuild` with MSVC. Pin the Electron version and test the installer on a clean VM.
2. **Money precision** — solved by storing cents; must be consistent end-to-end (main + renderer formatting).
3. **PDF font consistency** — bundle fonts; await `document.fonts.ready` (pdf4.dev guidance).
4. **Feature-parity verification** — this plan maps every current route/feature; a traceability checklist (route ↔ component ↔ repository) should gate each module.
5. **Dead Django code** (unrouted views, dormant Celery task) is intentionally dropped — flagged for review.
6. **Electron upgrade cadence** — only the last three majors are patched; budget for regular major upgrades.
7. **AV/Defender false positives** — a fresh signed Electron app bundling a native module is a known false-positive target on Windows Defender; plan for triage and, if persistent, submission to Microsoft's AV reporting portal.
8. **Code-signing certificate renewal** — since 2026 Windows certs expire after ~460 days; schedule renewal before expiry or updates stall at SmartScreen.
9. **scrypt cost drift** — the pinned `N=2**17` is a 2026-region choice; revisit on major security guidance changes, and keep hash+verify parameters in one constant so a future bump is a one-line change.
