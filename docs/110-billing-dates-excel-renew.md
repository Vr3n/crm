# 110 — Custom billing dates, local-time Excel export, renew shortcut

Implements GitHub #110 from `plans/110-billing-dates-excel-renew-plan.md`
(hardened through two grill passes; green-flagged). Branch:
`feat/110-111-billing-receipt-trust`.

## What changed

- **Shared date primitives** (`src/main/domain/dates.ts`, new): `assertValidBusinessDate`,
  `businessDateToUtc` (org-local noon → UTC), `todayInOrgTz`, `parseStoredInstant`
  (SQLite space-format aware), `excelDateForInstant` / `excelDateForDateOnly`,
  `resolveTimezone` / `isValidTimezone`, `tzOffsetMinutes`. `DEFAULT_TIMEZONE`
  moved here (`domain/lead.ts` re-exports it).
- **Timezone resolution** (`src/main/application/organization.ts`, new):
  `orgTimezone()` shared by Billing, Memberships, Export — no billing→leads
  coupling. `application/leads.ts` imports it now.
- **Contracts**: `issueDate` (required) on sale + renew inputs; optional on
  `finalizeInvoice`; `paymentDate` tightened to `YYYY-MM-DD`; export input gains
  `isodate` column format + optional validated `timezone`; preview accepts an
  optional `issueDate`.
- **Finalization is atomic** (`application/billing.ts` + new
  `invoiceRepo.updateNumber`): number + `finalized_at` + `finalized_by` commit
  together; failures roll back including the sequence. Also fixes the
  returned-but-never-persisted number bug. No migration: global
  `UNIQUE(invoices.number)` already enforced.
- **Sale/renew** write the shared billing date to `finalized_at` +
  `payment_date`; audit fields stay `now`. Invoice Number follows the issue
  date (derived from the `YYYY-MM-DD` string, tz-shift-proof).
- **PDF**: Invoice `issuedAt` now `finalized_at ?? created_at` (was `createdAt`).
- **Excel** (`convertCellValue`, pure + tested): date-only → wall-date serial
  (never flips days); instants → Organization-local wall time.
- **Renderer**: billing-date picker in sale OrderSummary, renew dialog and
  invoice finalize confirmation (preview follows the picked date, still
  non-reserving); payment form is date-only with linked-invoice default;
  back-date notices are renderer-local (IPC contract unchanged); export button
  threads `Organization.timezone`; expirations table row + record drawer open
  the renew dialog directly (payload extended with
  `customerId/planId/joiningDate`).
- **Billing-date cautions** (`renderer/lib/billing-warnings.ts`, new — pure,
  tested): shared `billingDateCautions()` wired into all three pickers.
  Any past date notes the series/gap consequence; past 30 days adds a CGST
  Rule-47 caution (reason + plain-text CBIC source; links stay unclickable —
  no `shell.openExternal` plumbing exists); cross-FY dates add a previous-FY
  GSTR-1 note. Future dates uncapped and unwarned. Sequence width needs no
  change (`padStart(2)` is a minimum; day-100 serializes as `-100` — pinned
  by test).

## Tests (all green)

- Unit 909/909 (67 files): `tests/domain/dates.test.ts` (16), `billing-issue-date.test.ts`
  (atomicity, back-date, collision rollback, invalid rejection, voided-number
  retention, sequence-width growth), `membership-sale-issue-date.test.ts`
  (shared date, audit split, joining/start/issue independence),
  `export-timezone.test.ts` (DST-inclusive boundary matrix),
  `tests/renderer/billing-warnings.test.ts` (7: boundaries, GST/FY codes,
  source citation), OrderSummary caution rendering (4),
  `tests/renderer/renew-target.test.ts` (4: expiration/dues mapping,
  null-hiding rule).
- E2E 12/12 (`npm run test:e2e`, real Electron): new
  `tests/e2e/billing-dates-renew.spec.ts` — back-dated sale → number/detail/
  payment-default; standalone future finalize → preview/number/workbook wall-day
  parse via ExcelJS; renew shortcut from expirations row, record drawer (both
  branches), customer current-membership card (Phase-1 `onRenew` wiring,
  permission-gated), and payments-due row (Phase-2 backend-resolved IDs).
  E2E-only test hooks: optional `testId` on `CatalogDatePicker` triggers,
  `membership-expirations-table` / `payments-due-table` cards.
  Both typechecks clean; eslint 0 errors.

## Contract for reviewers (see plan §4.5 + ADR-0010)

Business date ≠ audit timestamp; number+dates commit atomically; back-date
gaps permitted, failure gaps impossible; global UNIQUE is the concurrency
protection; `year` column carries `DDMMYY`; no `await` inside `withTransaction`
callbacks; warnings never block.
