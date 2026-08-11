# Module 3 — Auth (single admin, local)

- **Effort:** 2 days
- **Depends on:** M1 (`admin_user`, `audit_log` tables), M2 (`registerIpc`, guard hook,
  `auth:*` channels in `contract.ts`)
- **Delivers:** the main-process auth service (scrypt hash/verify, in-memory
  `authenticated` flag, first-run detection), the `auth:*` IPC handlers, the
  transaction-atomic `audit_log` writer, and the auto-lock timer hook. **This module is
  main-process only** — the login/create-admin UI lives in M4, consuming these channels.

## 1. Goal

By the end of this module, a senior reviewer can verify the entire auth story in one
file: hashing parameters, first-run gate, the boolean-flag session policy, the
in-flight-lock edge case, and audit-log atomicity. The `authService` is the single gate
the M2 registry calls on every handler.

## 2. Inputs / sources

- Master plan: `docs/electron_rewrite_plan.md` — Module 3 (auth), §2 Decisions
  (Auth state, scrypt), Risks #9 (scrypt cost drift).
- Django replaced here: allauth login/signup/email-verify + `User` model
  (`crown_crm/users/models.py`) → local "Create Admin" + login; no email verification,
  no password reset in v1.
- `admin_user` table from `0001_init.sql` (M1).

## 3. Design decisions (pinned)

1. **Single admin, single machine:** auth = an in-memory boolean flag on `authService`.
   **Re-login on every launch** — nothing is persisted to disk (no session/token table).
   "Stay signed in" is deliberately NOT in v1 (master plan §2).
2. **scrypt via `node:crypto`** with **explicit** cost parameters
   (`N = 2**17`, `r = 8`, `p = 1`, `KEYLEN = 64`), wrapped in a Promise because scrypt's
   callback API is **not** Promise-based (the classic `await scrypt(...)` bug).
3. **Verify is constant-time:** `timingSafeEqual` on equal-length Buffers. Compare hex
   strings of equal length only.
4. **Guard runs once at handler entry** (M2 registry) — an in-flight request completes
   even if the lock fires mid-execution (master plan Module 3 in-flight IPC policy).
5. **Audit log shares the mutation transaction** — a crash can never produce a mutation
   without its audit row, or an audit row for a rolled-back mutation.
6. **`authService.requireAuthenticated()` throws a typed `UNAUTHORIZED`** error that the
   M2 registry maps to the envelope.

## 4. Implementation steps

### 4.1 Auth service (`src/main/services/auth.ts`)

The pinned implementation (verbatim from master plan Module 3):

```ts
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_OPTS = { N: 2 ** 17, r: 8, p: 1 }; // ~128 MB memory — explicit, not Node defaults
const KEYLEN = 64;

function scrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    nodeScrypt(password, salt, KEYLEN, SCRYPT_OPTS, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(pw: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(pw, salt);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(pw: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await scrypt(pw, salt);
  return timingSafeEqual(Buffer.from(expectedHash, "hex"), actual);
}
```

Why explicit cost parameters: this hash is the **single gate** for the whole app's access
control. Node's scrypt defaults (`N = 16384`) are documented as a baseline, not a
recommendation for production auth. The chosen `N = 2**17` keeps login at a comfortable
~100 ms on a gym's counter PC while being memory-hard (~128 MB per hash).

**Cost-drift policy (master plan Risk #9):** all parameters live in this one constant.
A future bump is a one-line change; new hashes use the new cost, old hashes re-hash on
next successful login. (Not implemented in v1 — the single admin just resets the
password if ever needed.)

### 4.2 Auth state + first-run (`src/main/services/authState.ts`)

```ts
import type { Database } from "better-sqlite3";

export class UnauthorizedError extends Error {
  code = "UNAUTHORIZED";
  constructor() { super("Not authenticated"); }
}

class AuthState {
  private authenticated = false;
  private adminUserId: string | null = null;
  private admin: { name: string; email: string } | null = null;

  isAuthenticated(): boolean { return this.authenticated; }
  currentUser(): { name: string; email: string } | null { return this.admin; }

  /** Called by the M2 registry before every handler. */
  requireAuthenticated(): string {
    if (!this.authenticated || !this.adminUserId) throw new UnauthorizedError();
    return this.adminUserId;
  }

  login(userId: string, admin: { name: string; email: string }): void {
    this.authenticated = true;
    this.adminUserId = userId;
    this.admin = admin;
  }

  logout(): void {
    this.authenticated = false;
    this.adminUserId = null;
    this.admin = null;
  }
}

export const authState = new AuthState();

/** No active (non-deleted) admin row ⇒ first-run. */
export function needsAdmin(db: Database): boolean {
  const row = db.prepare("SELECT uuid FROM admin_user WHERE is_deleted = 0 LIMIT 1").get();
  return row === undefined;
}
```

### 4.3 Registration flow (`src/main/services/adminRegister.ts`)

```ts
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth";

/**
 * Create the first admin. Guarded upstream (M4 UI only shows this on first-run).
 * Insert + audit_log inside ONE transaction (decision #5).
 */
export async function createFirstAdmin(
  db: Database,
  input: { name: string; email: string; password: string },
): Promise<string> {
  if (!needsAdmin(db)) throw new Error("ALREADY_REGISTERED");
  const { salt, hash } = await hashPassword(input.password);
  const id = randomUUID();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO admin_user (uuid, created_at, updated_at, is_deleted, deleted_at,
         name, email, password_salt, password_hash)
       VALUES (?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
    ).run(id, now, now, input.name, input.email.toLowerCase(), salt, hash);
    writeAudit(db, { adminUserId: id, action: "auth.register", entity: "admin_user", entityId: id, detail: { email: input.email } });
  });
  tx();
  return id;
}
```

### 4.4 Login/logout handlers (`src/main/ipc/auth.ts`)

```ts
import { registerIpc } from "./registry";
import { CH, z } from "@common/contract";
import { authState, needsAdmin } from "../services/authState";
import { verifyPassword } from "../services/auth";
import { writeAudit } from "../services/audit";
import type { Database } from "better-sqlite3";

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const RegisterSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export function registerAuthIpc(db: Database): void {
  registerIpc(CH.auth.status, z.object({}), () => ({
    needsAdmin: needsAdmin(db),
    authenticated: authState.isAuthenticated(),
  }));

  registerIpc(CH.auth.register, RegisterSchema, async (_ctx, input) => {
    const id = await createFirstAdmin(db, input);
    authState.login(id, { name: input.name, email: input.email });
    return { ok: true as const };
  });

  registerIpc(CH.auth.login, LoginSchema, (ctx, input) => {
    const row = db.prepare(
      "SELECT uuid, name, email, password_salt, password_hash FROM admin_user WHERE email = ? AND is_deleted = 0",
    ).get(input.email.toLowerCase()) as
      | { uuid: string; name: string; email: string; password_salt: string; password_hash: string }
      | undefined;
    if (!row) throw new Error("INVALID_CREDENTIALS");

    const ok = await verifyPassword(input.password, row.password_salt, row.password_hash);
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    authState.login(row.uuid, { name: row.name, email: row.email });
    writeAudit(db, { adminUserId: row.uuid, action: "auth.login", entity: "admin_user", entityId: row.uuid });
    return { name: row.name, email: row.email };
  });

  registerIpc(CH.auth.logout, z.object({}), (ctx) => {
    authState.logout();
    writeAudit(db, { adminUserId: ctx.adminUserId, action: "auth.logout", entity: "admin_user", entityId: ctx.adminUserId });
    return { ok: true as const };
  });

  registerIpc(CH.auth.me, z.object({}), () =>
    authState.currentUser() ? { ...authState.currentUser()! } : null,
  );
}
```

**Auth-before-audit on logout:** `ctx.adminUserId` is captured before the flag clears,
so the logout audit row still names the user.

### 4.5 Audit writer (`src/main/services/audit.ts`)

Called *inside* the caller's transaction (decision #5):

```ts
import type { Database } from "better-sqlite3";

export interface AuditInput {
  adminUserId: string;
  action: string;   // e.g. 'lead.create', 'receipt.amount_edit'
  entity: string;   // e.g. 'lead', 'receipt'
  entityId: string;
  detail?: unknown; // small JSON-serialisable context
}

/** MUST be called from inside the same transaction as the mutation it records. */
export function writeAudit(db: Database, a: AuditInput): void {
  db.prepare(
    `INSERT INTO audit_log (admin_user_id, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    a.adminUserId,
    a.action,
    a.entity,
    a.entityId,
    a.detail ? JSON.stringify(a.detail) : null,
    new Date().toISOString(),
  );
}
```

Repository mutation patterns (M6+): any `repo` that mutates receives the audit input and
calls `writeAudit` inside the same `db.transaction(() => {...})()` block — mirroring
`createFirstAdmin` in §4.3.

### 4.6 Auto-lock timer

The service, driven by `app_settings.auto_lock_minutes` (0 = disabled, M10 UI):

```ts
// src/main/services/autoLock.ts
import { app } from "electron";
import { authState } from "./authState";

let timer: ReturnType<typeof setTimeout> | null = null;

export function armAutoLock(minutes: number): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (minutes <= 0) return;
  timer = setTimeout(() => {
    if (authState.isAuthenticated()) authState.logout();
    // renderer is told via a broadcast channel (M4 listens) or simply re-checks auth:me
  }, minutes * 60 * 1000);
}

app.on("before-quit", () => { if (timer) clearTimeout(timer); });
```

In-flight IPC policy (master plan): the flag is read **once at handler entry** inside
`registerIpc`. A request already past the guard completes; queued ones are rejected.
The window between lock and the renderer redirect is at most one already-queued mutation —
acceptable for a single-admin local app because the guard runs at the one place data
crosses into main.

M5/M10 reads `app_settings.auto_lock_minutes` at startup and calls `armAutoLock`.

### 4.7 Tests (`tests/auth/`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/main/db/migrations";
import { hashPassword, verifyPassword } from "../../src/main/services/auth";
import { needsAdmin } from "../../src/main/services/authState";
import { createFirstAdmin } from "../../src/main/services/adminRegister";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

describe("scrypt auth", () => {
  it("round-trips a password", async () => {
    const { salt, hash } = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", salt, hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const { salt, hash } = await hashPassword("a");
    expect(await verifyPassword("b", salt, hash)).toBe(false);
  });
  it("uses distinct salts", async () => {
    const a = await hashPassword("x");
    const b = await hashPassword("x");
    expect(a.salt).not.toBe(b.salt);
  });
});

describe("first-run + register", () => {
  it("starts needing an admin", () => expect(needsAdmin(db)).toBe(true));
  it("creates the admin and sets needsAdmin false, with an audit row", async () => {
    await createFirstAdmin(db, { name: "Owner", email: "gym@crown.local", password: "password123" });
    expect(needsAdmin(db)).toBe(false);
    const audit = db.prepare("SELECT action FROM audit_log WHERE action = 'auth.register'").get();
    expect(audit).toBeTruthy();
  });
  it("rejects a second registration", async () => {
    await createFirstAdmin(db, { name: "A", email: "a@b.c", password: "password123" });
    await expect(createFirstAdmin(db, { name: "B", email: "b@b.c", password: "password123" }))
      .rejects.toThrow("ALREADY_REGISTERED");
  });
});
```

## 5. Acceptance criteria (definition of done)

1. `authService` + `authState` + handlers exist; M2 `registerIpc` guard calls
   `requireAuthenticated()`.
2. First launch: `auth:status` → `{ needsAdmin: true, authenticated: false }`.
3. After register: `auth:me` returns the admin; login/logout round-trips; wrong password
   → `INVALID_CREDENTIALS`; unknown email → same error (no user enumeration).
4. Unauthenticated call to any non-auth handler → envelope `{ ok: false, code:
   'UNAUTHORIZED' }` (M2 registry test).
5. Every mutating action (register, login, logout, future repo mutations) writes one
   `audit_log` row **in the same transaction**.
6. Auto-lock arms from `auto_lock_minutes` and logs out on fire.
7. `npm test` green (auth + registry tests). `npm run lint` green.

## 6. Edge cases / gotchas

- **`await scrypt(...)` returns a Promise that is never resolved** — the classic bug this
  module pins against (wrap in a Promise, as §4.1).
- **`timingSafeEqual` throws on length mismatch.** Both sides are always `KEYLEN` bytes
  here because the stored hash is always 128 hex chars; if you ever support old hashes,
  guard length first (return `false`, never throw).
- **Email is normalized lowercase** at insert and lookup — prevents duplicate-account
  confusion.
- **Password min length (8)** enforced in the zod schema *and* in the UI (M4); scrypt has
  no min length of its own.
- **Audit of `createFirstAdmin`** uses the new admin's own id as `adminUserId` — there is
  no actor before the first admin exists.
- **Do not log passwords or hashes.** `audit_log.detail` never contains them.

## 7. Files touched

Created (in `crm-electron/`): `src/main/services/auth.ts`,
`src/main/services/authState.ts`, `src/main/services/adminRegister.ts`,
`src/main/services/audit.ts`, `src/main/services/autoLock.ts`,
`src/main/ipc/auth.ts` (wire `registerAuthIpc` in `src/main/index.ts`),
`tests/auth/*.test.ts`.

Updated: `src/common/contract.ts` (add `RegisterSchema`, `LoginSchema`, `StatusSchema`,
and auth channel input/output types if not already in M2).

Next: M4 (login / create-admin screens, `RequireAuth` gate, Toaster) consuming these
channels.
