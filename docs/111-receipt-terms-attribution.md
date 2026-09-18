# 111-receipt-terms-attribution.md — Receipt T&Cs + RecordedBy Attribution (Issue #111)

Per-document Terms & Conditions editable in Organization settings and printed on
PDF footers, plus session-User attribution ("Finalized By") on invoice documents.

## Storage

- Migration v31 `org_receipt_terms` (`src/main/db/migrations/20260918120000_org_receipt_terms/migration.sql`):
  `organizations.invoice_terms / receipt_terms / refund_terms TEXT` with seeded
  DEFAULTs, so existing rows backfill and new receipts are never blank until an
  owner edits them.
- Schema: `src/main/db/schema/identity.ts`; domain: `Organization.invoiceTerms /
  receiptTerms / refundTerms` (`src/main/domain/identity.ts`); repo:
  `organizationRepo.update()` persists them, NULL clears the footer block.

## IPC / application

- `identity:updateOrganization` handler (`src/main/ipc/identity.ts`) now serves
  profile updates; input validated by `updateOrganizationInputSchema`
  (`src/shared/contracts/identity.ts`, each terms block capped at ~2000 chars so
  a PDF footer stays a single page); output shape extended in
  `src/shared/contracts/identity-read.ts` and `identity-read.ts`.
- Terms are trimmed, stored as NULL when blank; `org.manage`-gated.
- Patch semantics: `updateOrganization` / `organizationRepo.update` write only
  keys present in the input — omitted optional fields keep stored values,
  explicit null/blank clears.

## PDFs

- `getOrgBranding()` (`src/main/application/pdf.ts`) live-reads all three terms
  blocks on every print (never snapshotted); `OrgBranding` gains
  `timezone/invoiceTerms/receiptTerms/refundTerms` (`src/main/pdf/types.ts`).
- `buildTermsBlock()` (`src/main/pdf/templates/shared.ts`) renders the footer
  block above the footer; empty string when unset so documents stay clean.
  Wired into invoice, payment-receipt, and refund-receipt templates.
- Attribution: `resolveAttribution()` stamps the session User who finalized the
  invoice as "Full Name (Role)". The name resolves from the stamped User row
  unconditionally (historical documents keep attribution after a staffer is
  deactivated/removed); only the "(Role)" suffix needs an ACTIVE staff
  membership row. Null (→ "Unknown User") only when the User row itself is
  missing; null for DRAFT previews (no Finalized By line).
  Never a hardcoded name, never an inferred `created_by` fallback.
- `formatNow(timezone?)` renders the generated-at stamp in the Organization's
  timezone (Asia/Kolkata fallback).

## Frontend

- `OrgEditDialog`: three terms textareas with validators + char counters;
  `OrgProfileCard`: terms preview. Shared rules in
  `src/renderer/src/features/identity/validation.ts`
  (`ORG_TERMS_MAX_LENGTH`, `termsError`).

## Tests

- `tests/main/pdf/attribution.test.ts` — resolver regression: active staffer,
  missing user, deactivated/removed membership, non-owner role suffix.
- `tests/main/application/identity-update-organization.test.ts` — profile/terms
  update rules + partial-update preservation.
- `tests/main/pdf/format-now.test.ts` — timezone rendering + fallback.
- `tests/renderer/terms-validation.test.ts` — client validation mirror.
- Extended: repo identity, PDF templates, migrations (v31) suites.
