# Module 0 — Scaffold & build tooling

- **Effort:** 2 days
- **Depends on:** nothing (first module)
- **Delivers:** a compiling, runnable electron-vite + React 19 + TS skeleton with
  the exact dependency set, scripts and directory layout the rest of the modules
  build on. No business logic.

---

## 1. Goal

Create the new application repo (`crm-electron/`) — or, if preferred, a new top-level
folder inside this repository — that is ready to accept Modules 1–5. "Ready" means:

- `npm run dev` opens an empty Electron window from a React renderer.
- `npm run build` type-checks and bundles all three targets (main / preload / renderer).
- `npm test` runs vitest with one smoke test.
- The directory layout from the master plan (§4) exists.
- Native module rebuild is wired so `better-sqlite3` works against Electron's ABI.
- **No CDN / network assets at runtime** — everything the app needs ships in the
  installer (offline constraint).

## 2. Inputs / sources

- Master plan: `docs/electron_rewrite_plan.md` — §2 Decisions, §4 Target Repository
  Layout, Module 0.
- No Django code is ported in this module; it is pure tooling.

## 3. Design decisions (pinned)

1. **Scaffold generator:** `npm create @quick-start/electron` (electron-vite template),
   React + TypeScript variant. Do **not** hand-roll the boilerplate; the template ships
   the correct `main`/`preload`/`renderer` split and dev-mode wiring.
2. **Version pinning:** record exact versions in `package.json` (no `^` ranges) at the
   end of M0, including `electron`. Pin the Electron major to a **current supported
   train** (Electron only patches the last three majors — master plan Risk #6).
3. **Native module strategy (decided):** rely on `better-sqlite3` **prebuilt binaries**
   via `prebuild-install`, run through `electron-builder install-app-deps`. The old
   `electron-rebuild` npm package is deprecated; `install-app-deps` wraps the maintained
   `@electron/rebuild`. MSVC build tools are **not** a standing requirement (master plan
   Module 12).
4. **Offline rule:** every runtime asset (Bootstrap, Chart.js, fonts) is bundled via npm
   packages — never a CDN `<link>`. This is enforced from day one so nothing sneaks in
   later.

## 4. Implementation steps

### 4.1 Create the project

```bash
mkdir crm-electron
cd crm-electron
npm create @quick-start/electron@latest . -- --template react-ts
npm install
```

The template creates `package.json`, `electron.vite.config.ts`, `tsconfig.node.json`,
`tsconfig.web.json`, `src/main/index.ts`, `src/preload/index.ts`,
`src/renderer/index.html` and `src/renderer/src/`.

### 4.2 Add dependencies

```bash
npm install electron-vite vite typescript react react-dom react-router-dom \
  @tanstack/react-query zod better-sqlite3 electron-window-state \
  bootstrap react-bootstrap chart.js react-chartjs-2

npm install -D electron electron-builder vitest @types/react @types/react-dom \
  @types/better-sqlite3 eslint typescript-eslint
```

Notes:

- `electron` and `electron-builder` are dev-dependencies (the app itself does not need
  `electron` at runtime — it **is** the runtime).
- `react-bootstrap` is optional; if you port the Bootstrap templates with plain
  `bootstrap` + JSX, drop it. **Keep it consistent with M4** (this file chooses
  `react-bootstrap` for modal/toast primitives; re-check when writing M4).
- `vitest` is used for M1+ tests. Playwright for E2E is added in M13, not now.

### 4.3 `package.json` — scripts and postinstall

```jsonc
{
  "name": "crown-crm",
  "version": "0.1.0",
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "start": "electron-vite preview",
    "build": "npm run typecheck && electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . && npm run typecheck",
    "postinstall": "electron-builder install-app-deps",
  },
}
```

`postinstall` is the **critical line**: `better-sqlite3` is compiled (or its prebuild
fetched) against the **Node ABI of the bundled Electron**, not the system Node. Without
it the app crashes at `require('better-sqlite3')` with an `NODE_MODULE_VERSION` error.

### 4.4 `electron.vite.config.ts`

```ts
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@common": resolve("src/common"), "@main": resolve("src/main") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@common": resolve("src/common"),
      },
    },
    plugins: [react()],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
```

`externalizeDepsPlugin()` keeps `better-sqlite3` and `electron` as runtime `require`s in
the main bundle — they must not be bundled/transpiled.

### 4.5 Directory skeleton

Create the layout from master plan §4 (empty or with a placeholder file):

```
crm-electron/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml          # minimal, filled out in M12
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── build/                        # icons, installer assets (M12); placeholder favicon now
└── src/
    ├── common/                   # contract.ts, zod schemas, channel names  (M2)
    ├── main/
    │   ├── index.ts              # app lifecycle, window creation            (M2/M11)
    │   ├── db/                   # connection, migrations, repositories     (M1)
    │   ├── services/             # auth, receipt, pdf, backup               (M3+)
    │   ├── ipc/                  # registerIpc registry                     (M2)
    │   └── windows/              # main window, hardening helper            (M2)
    ├── preload/index.ts          # contextBridge → window.api               (M2)
    └── renderer/src/             # main.tsx, App.tsx, router, features, components
```

### 4.6 TypeScript project references

`tsconfig.json` (root, solution file):

```jsonc
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" },
  ],
}
```

`tsconfig.node.json` covers `src/main`, `src/preload`, `src/common` with
`"module": "ESNext"`, `"moduleResolution": "bundler"`, `"types": ["node"]`.
`tsconfig.web.json` covers `src/renderer` + `src/common` with `"jsx": "react-jsx"`,
`"lib": ["DOM", "DOM.Iterable", "ESNext"]`.

**Important:** `src/common` is shared by both node and web targets — it must stay
dependency-free (only `zod`). Never import Electron or Node APIs from `src/common`.

### 4.7 `.gitignore` + git init

Ignore at minimum: `node_modules/`, `out/`, `dist/`, `.DS_Store`, `*.log`. Also ignore
`src/main/db/migrations/__snapshots__` style generated dirs if any appear later. Create
the repo only after M0 is verified (or scaffold inside the existing repo as a folder —
decide in step 8).

### 4.8 Minimal smoke wiring

Leave the template's `src/main/index.ts` as-is for now (it creates the main window with
`contextIsolation: true` by default). Do **not** add business logic yet — M2 replaces the
window creation with the hardened version.

Remove the template's demo renderer content so `src/renderer/src/App.tsx` renders a stub:

```tsx
export default function App() {
  return (
    <main>
      <h1>Crown CRM — walking skeleton</h1>
    </main>
  );
}
```

### 4.9 Vitest smoke test

```ts
// tests/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs vitest from the Electron project", () => {
    expect(1 + 1).toBe(2);
  });
});
```

## 5. Acceptance criteria (definition of done)

1. `npm install` completes with no errors and `postinstall` runs
   `electron-builder install-app-deps` successfully (no MSVC build triggered on Linux CI
   if using prebuilds).
2. `npm run dev` opens an Electron window titled "Crown CRM" showing the stub.
3. `npm run build` passes type-check and produces `out/main`, `out/preload`,
   `out/renderer`.
4. `npm test` is green.
5. `npm run lint` is green.
6. `git status` shows the skeleton committed (or folder created) with the exact layout
   from §4.5.
7. Running `node -e "require('better-sqlite3')"` **fails** (it is not built for system
   Node) but loading it inside Electron dev **succeeds** — this is the proof that the
   ABI rebuild wiring is correct.

## 6. Edge cases / gotchas

- **`externalizeDepsPlugin` missing** → `better-sqlite3` gets bundled and its relative
  `build/Release/*.node` paths break. Always keep it in `main.plugins`.
- **`preload` with `sandbox: true`** cannot use ESM `import`; the template emits a
  CommonJS preload by default. Do not "fix" it to ESM — M2's preload must stay CommonJS.
- **Electron version vs `better-sqlite3` prebuilds:** if `install-app-deps` falls back to
  a source build (needs MSVC), pin a `better-sqlite3` version whose prebuilds cover the
  pinned Electron ABI. Log the fallback; M12 covers the rare one-off `@electron/rebuild`.
- **Monorepo double-postinstall:** if scaffolded _inside_ this repo, ensure the root
  `postinstall` does not conflict with the app folder's `postinstall`.

## 7. Files touched

Created: `package.json`, `electron.vite.config.ts`, `tsconfig*.json`,
`electron-builder.yml` (stub), `build/` (placeholder), `src/{common,main,preload,
renderer}/…`, `tests/smoke.test.ts`, `.gitignore`.

No Django files are read or modified in M0.
