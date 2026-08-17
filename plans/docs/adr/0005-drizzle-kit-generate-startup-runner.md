# drizzle-kit generate + custom startup migration runner

Migrations are authored as Drizzle schema (`sqliteTable`), generated to versioned `.sql`
files with `drizzle-kit generate`, and applied by a custom runner at app startup. The
SQL files are bundled into the main-process bundle via Vite `?raw` imports, so there are
no runtime `.sql` files to ship alongside the packaged Electron app — the shipped
inline-TS-migration pattern solved the same bundling problem, and this keeps that
guarantee while gaining drizzle-kit's snapshot/DIFF workflow. Applied migrations are
tracked in `schema_migrations` (unchanged semantics); migrations are never edited after
application (guidelines §22). We chose this over `drizzle-kit push` (no CLI at runtime)
and over Drizzle's folder-based `migrate()` helper (reads `.sql` at runtime, which
breaks under electron-vite packaging without extra `extraResources` wiring).