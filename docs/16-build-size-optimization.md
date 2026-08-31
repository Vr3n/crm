# 16 — Build Size Optimization

Reduced the final Windows distribution from **116 MB → 98 MB** (installer) and **499 MB → 365 MB** (unpacked) by fixing dependency placement and stripping unused locale packs.

## Root Cause

electron-vite externalizes `dependencies` for the main/preload builds (leaving them as `require()` calls resolved from `node_modules` at runtime), while the renderer **bundles everything** via Vite regardless of where it sits. electron-builder, however, copies **all** `dependencies` (and their transitive trees) into `app.asar`.

This means every renderer-only package — React, Radix, TanStack, Lucide, date-fns, fonts, etc. — was being shipped **twice**: once bundled into the renderer JS assets and once as raw `node_modules` inside `app.asar`. Several packages were entirely unused at runtime (`@libsql/client`, `dotenv`).

## Changes

### `package.json` — dependency reclassification

| Section | Packages |
|---|---|
| **`dependencies`** (runtime main/preload externals only) | `@electron-toolkit/preload`, `@electron-toolkit/utils`, `drizzle-orm`, `exceljs`, `zod` |
| **Moved to `devDependencies`** (Vite-bundled) | `@fontsource*`, `@radix-ui/*`, `@tanstack/*`, `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `lucide-react`, `radix-ui`, `react-day-picker`, `react-router-dom`, `shadcn`, `sonner`, `tailwind-merge`, `tw-animate-css` |
| **Removed** (unused) | `@libsql/client`, `dotenv` |

### `electron-builder.yml`

```yaml
win:
  electronLanguages: ["en-US"]   # only ship English locale (was 65 languages = 46 MB)
compression: maximum              # NSIS max compression (default: normal)
```

> **Note:** Use region-qualified `"en-US"` rather than bare `"en"`. electron-builder 26.15.x has a bug (#10006) where bare language codes can empty the `locales/` directory, causing a startup crash.

## Size Breakdown

| Artifact | Before | After | Delta |
|---|---|---|---|
| `CrownCRM-setup.exe` (installer) | 116.46 MB | 98.13 MB | −18.33 MB |
| `win-unpacked/` total | 499.36 MB | 365.15 MB | −134.21 MB |
| ├─ Electron/Chromium runtime | ~300 MB | ~313 MB | (unchanged) |
| ├─ `locales/` | 46.65 MB (65 files) | 0.54 MB (1 file) | −46.11 MB |
| ├─ `app.asar` | 142.58 MB | 50.93 MB | −91.65 MB |
| └─ `app.asar.unpacked` | 9.29 MB | 0.83 MB | −8.46 MB |

`app.asar` now contains only the production runtime dependencies and their transitive trees (`drizzle-orm`, `exceljs` + jszip/archiver/fast-csv, `zod`, `@electron-toolkit/*`).

## Verification

- `npm run typecheck` — passes (same pre-existing errors, no regressions)
- `npm test` — 38/38 test files, 575/575 tests pass
- `npm run build:win` — clean build, installer generated
