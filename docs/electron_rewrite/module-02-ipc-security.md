# Module 2 — IPC contract, security & envelope

- **Effort:** 2 days
- **Depends on:** M0 (scaffold), M1 (`db`, repositories)
- **Delivers:** the single typed IPC contract in `src/common/contract.ts`, the
  `registerIpc` handler registry with schema validation + auth guard + envelope, the
  hardened `BrowserWindow` (CSP, `will-navigate`, `setWindowOpenHandler`,
  `webSecurity`), and the preload `window.api` bridge. Also delivers the renderer-side
  `lib/api.ts` typed wrapper so the UI never sees raw channel strings.

## 1. Goal

The renderer is an untrusted UI layer. Every piece of data that crosses the process
boundary is validated by a zod schema in **main**, and the answer always comes back in a
uniform `{ ok, data | error }` envelope. No channel name, no schema, no error mapping is
defined more than once.

## 2. Inputs / sources

- Master plan: `docs/electron_rewrite_plan.md` — Module 2 (IPC contract, security,
  envelope), §2 Decisions (Renderer CSP, contextIsolation/sandbox), §5 Module 2.
- `src/common` and `src/preload` from the M0 template (to replace).

## 3. Design decisions (pinned)

1. **`invoke`/`handle` only** (Promise-based). No fire-and-forget `send` for data flows;
   the one allowed `send` is the M8 PDF data channel to the PDF window (which has its own
   preload).
2. **Envelope is the only return shape** from any handler: `{ ok: true, data }` or
   `{ ok: false, error: { code, message, details? } }`. Renderer never throws across IPC.
3. **zod is the single validation gate.** Shared schemas live in `src/common/contract.ts`
   and are imported by both `main` (parse) and `renderer` (type inference). Channel names
   are string constants there too.
4. **Auth guard is one place:** inside `registerIpc`, checked at handler entry — not in
   every handler (see M3).
5. **`webSecurity: true` stays default**, never flipped during debugging.
6. **Navigation hardening applies to every window** via a shared helper (main window now,
   PDF window later).
7. **CSP pinned via `<meta>`** in `index.html` — the exact string from master plan §2.

## 4. Implementation steps

### 4.1 The contract (`src/common/contract.ts`)

Dependency-free (only `zod`) — imported by main, preload and renderer.

```ts
import { z } from "zod";

// ---- channel names (single source of truth) ----
export const CH = {
  auth: {
    status: "auth:status",
    register: "auth:register",
    login: "auth:login",
    logout: "auth:logout",
    me: "auth:me",
  },
  leads: {
    list: "leads:list",
    create: "leads:create",
    get: "leads:get",
    softDelete: "leads:softDelete",
  },
  settings: {
    get: "settings:get",
    update: "settings:update",
  },
} as const;

// ---- zod schemas (shared validation) ----
export const MobileSchema = z
  .string()
  .regex(/^\d{10}$/, "Enter a valid 10-digit mobile number.");
export const PincodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter a valid 6-digit pincode.");
export const EmailSchema = z.string().email();

export const CreateLeadSchema = z.object({
  first_name: z.string().min(1).max(50),
  middle_name: z.string().max(50).optional().nullable(),
  last_name: z.string().min(1).max(50),
  gender: z.enum(["M", "F", "O"]).optional().nullable(),
  status: z.enum(["NEW", "INTERESTED", "CONVERTED", "DROPPED"]).optional(),
  mobileNumbers: z.array(MobileSchema).optional(),
  emails: z.array(EmailSchema).optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

export const ListLeadsSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["NEW", "INTERESTED", "CONVERTED", "DROPPED"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});
export type ListLeadsParams = z.infer<typeof ListLeadsSchema>;

// ---- the envelope ----
export type ApiError = {
  code: string; // e.g. 'VALIDATION', 'UNAUTHORIZED', 'NOT_FOUND', 'OVERPAYMENT', 'INTERNAL'
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type LeadRow = {
  uuid: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: "M" | "F" | "O" | null;
  status: "NEW" | "INTERESTED" | "CONVERTED" | "DROPPED";
};
```

Rules for this file:

- **No Electron/Node imports** (shared with the web target).
- Every channel's input schema and output type are declared here before any handler or
  component uses them — changing the contract requires touching this file, and
  type-check catches every consumer.
- Schemas mirror the Django validators exactly (10-digit mobile regex, 6-digit pincode,
  email) — see M6 for the full lead set; M2 starts with what M3–M5 need.

### 4.2 Handler registry (`src/main/ipc/registry.ts`)

```ts
import { ipcMain } from "electron";
import type { Database } from "better-sqlite3";
import type { z } from "zod";
import type { ApiEnvelope, ApiError } from "@common/contract";
import { getDb } from "../db/connection";
import { authService } from "../services/auth"; // M3

export interface HandlerCtx {
  db: Database;
  adminUserId: string; // set by the auth guard (M3)
}

type Handler<In, Out> = (ctx: HandlerCtx, input: In) => Out;

function toError(e: unknown): ApiError {
  if (e instanceof z.ZodError) {
    return {
      code: "VALIDATION",
      message: e.errors[0]?.message ?? "Invalid input",
      details: e.errors,
    };
  }
  if (e instanceof Error && e.message.startsWith("OVERPAYMENT")) {
    return { code: "OVERPAYMENT", message: e.message };
  }
  return { code: "INTERNAL", message: "Something went wrong" };
}

export function registerIpc<In, Out>(
  channel: string,
  schema: z.ZodType<In>,
  fn: (ctx: HandlerCtx, input: In) => Out,
): void {
  ipcMain.handle(channel, async (_event, raw: unknown): Promise<ApiEnvelope<Out>> => {
    try {
      // 1. Auth guard — read ONCE at entry (M3: in-flight IPC policy)
      const adminUserId = authService.requireAuthenticated();
      // 2. Validate
      const parsed = schema.parse(raw);
      // 3. Run against the real db
      return { ok: true as const, data: fn({ db: getDb(), adminUserId }, parsed) };
    } catch (e) {
      return { ok: false as const, error: toError(e) };
    }
  });
}

// Usage:
registerIpc(CH.leads.list, ListLeadsSchema, (ctx, params) =>
  leadRepo.list(ctx.db, params),
);
```

Ordering is deliberate: **guard → validate → run**. A request that already passed the
guard completes even if auto-lock fires mid-execution; anything queued after the lock is
rejected (M3 auto-lock policy).

### 4.3 Preload (`src/preload/index.ts`)

Stays CommonJS (sandboxed preload cannot use ESM). Exposes a **typed, namespaced** API —
the renderer never sees raw channel strings.

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { ApiEnvelope, CreateLeadInput, ListLeadsParams, LeadRow } from "../common/contract";

const api = {
  auth: {
    status: (): Promise<ApiEnvelope<{ needsAdmin: boolean; authenticated: boolean }>> =>
      ipcRenderer.invoke("auth:status"),
    register: (input: { name: string; email: string; password: string }): Promise<ApiEnvelope<{ ok: true }>> =>
      ipcRenderer.invoke("auth:register", input),
    login: (input: { email: string; password: string }): Promise<ApiEnvelope<{ name: string; email: string }>> =>
      ipcRenderer.invoke("auth:login", input),
    logout: (): Promise<ApiEnvelope<{ ok: true }>> =>
      ipcRenderer.invoke("auth:logout"),
    me: (): Promise<ApiEnvelope<{ name: string; email: string } | null>> =>
      ipcRenderer.invoke("auth:me"),
  },
  leads: {
    list: (params: ListLeadsParams): Promise<ApiEnvelope<{ rows: LeadRow[]; total: number }>> =>
      ipcRenderer.invoke("leads:list", params),
    create: (data: CreateLeadInput): Promise<ApiEnvelope<LeadRow>> =>
      ipcRenderer.invoke("leads:create", data),
  },
};

contextBridge.exposeInMainWorld("api", api);
export type Api = typeof api;
```

Type note: `window.api` is typed in the renderer via a declaration:

```ts
// src/renderer/src/env.d.ts
import type { Api } from "../../preload/index";
declare global {
  interface Window { api: Api; }
}
```

### 4.4 Hardened main window (`src/main/windows/mainWindow.ts`)

```ts
import { BrowserWindow, shell } from "electron";
import path from "node:path";

/** Apply the same hardening to every window (main + future PDF window). */
export function applyWindowHardening(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Deny any attempt to open a new window from renderer content.
    void url;
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    // Only allow our own file/dev URLs; block everything else (pasted links etc).
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "Crown CRM",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true, // always
      nodeIntegration: false, // always
      sandbox: true, // always
      webSecurity: true, // default; never flipped during debugging
    },
  });
  applyWindowHardening(win);
  win.on("ready-to-show", () => win.show());

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]); // dev server
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
```

`applyWindowHardening` is the shared helper the PDF window (M8) also calls.

### 4.5 Pinned CSP in `src/renderer/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'"
    />
    <title>Crown CRM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- `'unsafe-inline'` for styles is required by Bootstrap inline style attributes.
- Scripts are locked to `'self'` — the app bundles everything (M0 offline rule).
- `connect-src 'self'` allows the renderer to reach only itself; there is no network
  backend (master plan: no telemetry, offline).

### 4.6 Renderer wrapper (`src/renderer/src/lib/api.ts`)

A typed thin wrapper over `window.api` that unpacks the envelope and throws a typed
`ApiError` on `{ ok: false }`, so React components use try/catch or TanStack Query's
`onError`:

```ts
import type { ApiEnvelope } from "@common/contract";

export class ApiCallError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

export async function call<T>(p: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new ApiCallError(res.error.code, res.error.message, res.error.details);
  return res.data;
}

// feature wrappers go here, e.g.:
// export const listLeads = (p: ListLeadsParams) => call(window.api.leads.list(p));
```

`lib/query.ts` (M4) configures TanStack Query to treat any `ApiCallError` as a query
error and surface toasts.

### 4.7 Tests (`tests/contract/`)

```ts
// tests/contract/schema.test.ts
import { describe, it, expect } from "vitest";
import { CreateLeadSchema, MobileSchema, PincodeSchema } from "../../src/common/contract";

describe("shared zod schemas", () => {
  it("accepts a valid 10-digit mobile", () => {
    expect(MobileSchema.parse("9876543210")).toBe("9876543210");
  });
  it("rejects a short mobile", () => {
    expect(() => MobileSchema.parse("98765")).toThrow();
  });
  it("rejects a bad pincode", () => {
    expect(() => PincodeSchema.parse("12ab6")).toThrow();
  });
  it("strips nothing and enforces lead name lengths", () => {
    expect(() => CreateLeadSchema.parse({ first_name: "", last_name: "X" })).toThrow();
  });
});
```

Add a `registerIpc` unit test that stubs `ipcMain.handle` + `authService` and asserts:
valid input → `{ ok: true }`; invalid → `{ ok: false, error.code: 'VALIDATION' }`;
unauthenticated → `{ ok: false, error.code: 'UNAUTHORIZED' }`. Mock `getDb` with
`:memory:`.

## 5. Acceptance criteria (definition of done)

1. `src/common/contract.ts` declares every channel + schema used by M3–M5 (auth, leads
   list/create, settings get/update).
2. `registerIpc` returns the envelope for success, `VALIDATION`, `UNAUTHORIZED`, and
   `INTERNAL` — verified by unit test.
3. Main window has `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
   `webSecurity: true`; both hardening callbacks are registered.
4. `index.html` carries the exact pinned CSP string.
5. Renderer compiles against `window.api` with types from `env.d.ts`; no raw channel
   strings outside `src/common` and `src/preload`.
6. `npm run build` + `npm run lint` + `npm test` green.

## 6. Edge cases / gotchas

- **Preload must be CommonJS** under `sandbox: true` — do not switch the M0 template to
  ESM preload.
- **`will-navigate` fires for the initial `loadURL`/`loadFile`** — guard against
  blocking the initial load (compare `url !== win.webContents.getURL()`).
- **zod `.default()` on shared schemas:** defaults run on `.parse`; keep them out of
  `.safeParse`-style pre-validation on the renderer side to avoid double-defaulting.
- **Never trust `event.sender` UUID for identity.** The auth guard reads the single
  in-memory flag (M3); there is no per-window session.
- **Error codes are stable strings** — the renderer maps them to user-facing messages;
  do not leak raw SQL or stack traces into `message` (log them server-side only).

## 7. Files touched

Created/updated (in `crm-electron/`): `src/common/contract.ts`,
`src/main/ipc/registry.ts`, `src/preload/index.ts`, `src/main/windows/mainWindow.ts`,
`src/renderer/index.html` (CSP), `src/renderer/src/lib/api.ts`,
`src/renderer/src/env.d.ts`, `tests/contract/*.test.ts`, `src/main/index.ts` (wire
`createMainWindow` + `getDb()`).

Next: M3 (auth service + `authService.requireAuthenticated`) — `registry.ts` references
it; stub it now and implement in M3.
