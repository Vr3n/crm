# 15-organization-logo.md — Gym Logo (BrandMark)

Single optional logo per Organization. `name` stays the identity; logo is decoration in sidebar + PDFs.

## Storage
- Files: `{userData}/logos/{orgId}/{uuid}.ext` (jpg/jpeg/png/webp, max 5MB). See `src/main/lib/photo-storage.ts` (`getLogoDirectorySync/saveLogoSync`).
- DB: `organizations.logo` holds the FILENAME only. Legacy `data:` values are treated as missing.
- Replace deletes the old file; remove clears the column. Full backup = DB + logos dir.

## IPC
- Channels: `organization.logo:update/get/delete` (`src/shared/contracts/ipc.channels.ts`).
- Contracts: `src/shared/contracts/organization-logo.ts`. Use cases: `src/main/application/organization-logo.ts` (`org.manage` for write, `org.view` for read). Preload: `window.api.organizationLogo`.

## Surfaces
- Setup: optional "Gym logo" picker on the first-run organization form (`AuthGate`, transient mode like PersonAvatar — held in local state, sent with the setup payload). Validated + written atomically inside `setupOrganization`; absent stays valid.
- Settings: `OrgLogoPicker` (first section of `OrgEditDialog`) + `OrgProfileCard` header. Instant preview via object URL; persistence via `useUpdateOrgLogo/useDeleteOrgLogo`; `['identity-settings']` invalidated.
- Sidebar: `Sidebar.tsx` brand row — 36px rounded logo + truncated gym name; collapsed = logo only; fallback = Crown icon. `Topbar` mobile mark unchanged (text) — extend if needed.
- PDFs: `getOrgBranding()` (`src/main/application/pdf.ts`) resolves filename to `data:{mime};base64` URI. Missing/corrupt file prints WITHOUT logo; `pdfApi` (`src/renderer/src/features/pdf/api.ts`) fires `warnIfLogoMissing()` after every successful export — toast "Printed without logo — re-upload it in Organization settings." Never blocks print.

## Tests
- `tests/identity/organization-logo.test.ts` — contract + client validation mirror.
- `tests/identity/setup-logo.test.ts` — setup persists logo atomically, no-logo setup, bad type/oversize rejection.
- `tests/e2e/organization-logo.spec.ts` — upload shows logo in sidebar + profile card, remove restores fallback, invalid file errors. Requires built app (`out/main/index.js`); run via Playwright electron project.
