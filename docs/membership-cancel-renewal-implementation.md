# Membership Cancellation & Renewal — Implementation Details

## Overview
Implements single-command membership cancellation (with timing dispatch, reason codes, and integrated refund) and membership renewal (new entitlement row + invoice + optional payment).

## Key Decisions (from Plan)
- **R1.1**: Single `cancelMembership` command with `timing: IMMEDIATE | END_OF_PERIOD | NOTICE_DAYS`. Refund only when IMMEDIATE. Single `MEMBERSHIP_CANCEL` permission.
- **R1.2**: Frozen membership cancel — prorate on freeze-extended end date; auto-close open freeze rows in same tx; freeze fee non-refundable.
- **R1.3**: Derive at read only — no `reconcileStatuses` writes; `deriveMembershipStatus` gains `cancellationEffectiveDate` check.
- **R1.4**: Events only — no `renewed_from_membership_id` column; `RENEWED` (old) + `CREATED` (new) events carry lineage in data JSON.
- **R1.5**: Open invoice balance left intact on cancel — refund returns part of paid; no write-off logic.
- **R2.1**: Cancel EXPIRED — reason-only, refund disabled, status stays EXPIRED (derive-at-read).
- **R2.2**: Renew source rows — any status (ACTIVE, EXPIRED, CANCELLED); overlap guard governs new window.
- **R2.3**: Renewal `joiningDate` — fresh input per renewal (default = startDate).
- **R2.4**: Legacy rows / no invoice — refund disabled, cancel proceeds.
- **R2.5**: Canonical names — request / execute / revert; `CANCELLATION_REVERTED` event.

## Bug Fixes Found During Implementation

### 1. `cancelMembership` Status Derivation (memberships.ts:487-498)
**Bug**: The EXPIRED reason-only check used `membership.status === 'EXPIRED'`, but `mapMembership` returns the raw stored status (`'ACTIVE'` from sale), not the derived status. A membership with past `endDate` is logically EXPIRED but stored as ACTIVE.

**Fix**: Added `deriveMembershipStatus` call at the decision point to compute the effective status before checking.

### 2. Renew Overlap Guard Excluding Source (memberships.ts:824-830)
**Bug**: `getOverlappingActive` received `input.sourceMembershipId` as the `excludeId`, which excluded the source membership from the overlap check. Since the source IS the active membership overlapping with the new window, the guard was bypassed.

**Fix**: Removed `sourceMembershipId` from the overlap check. The `excludeId` parameter is designed for edit scenarios, not renewal.

### 3. Migration Test Version Count
**Bug**: Adding migration v27 broke 4 existing migration tests that hardcoded version arrays/counts.

**Fix**: Updated all version arrays and count assertions in `tests/db/migrations.test.ts` to include v27.

## Files Changed

### Migration
- `src/main/db/migrations/20260908120000_membership_cancel_renew/migration.sql` — adds `cancellation_reason_code TEXT` column
- `src/main/db/migrations.ts` — registered as version 28 (v27 was already consumed by a removed `person_photos` migration on dev databases; version numbers must never be reused)

### Domain
- `src/main/domain/membership.ts` — `CancellationReasonCode`, `CancellationTiming` types; `CANCELLATION_REVERTED` event; extended `deriveMembershipStatus` with `cancellationEffectiveDate`; `isPendingCancellation`, `calculateProratedRefund`, `resolveCancellationEffectiveDate` helpers

### Schema
- `src/main/db/schema/membership.ts` — `cancellationReasonCode` column

### Application
- `src/main/application/memberships.ts` — `cancelMembership`, `revertCancellationRequest`, `renewMembership`, `getMembershipRefundState`

### Repository
- `src/main/repositories/membership.ts` — `setCancellation`, `clearCancellation`, `getOverlappingActive`, `closeOpenFreezes`

### Contracts
- `src/shared/contracts/membership-cancel-renew.ts` — all Zod schemas
- `src/shared/contracts/ipc.channels.ts` — 4 new channel constants

### IPC
- `src/main/ipc/memberships.ts` — 4 new handlers
- `src/main/ipc/customers.ts` — extended `buildCustomerOutput` with cancellation fields

### Preload
- `src/preload/index.ts` + `src/preload/index.d.ts` — `memberships` namespace extended

### Renderer
- `src/renderer/src/features/customers/types.ts` — extended `Membership` interface
- `src/renderer/src/features/customers/build.ts` — extended `effectiveStatus`, added `isPendingCancellation`
- `src/renderer/src/features/customers/pages/CustomerDetailPage.tsx` — dialog + handlers wired
- `src/renderer/src/features/customers/components/detail/current-membership-card.tsx` — action buttons + pending banner
- `src/renderer/src/features/memberships/types.ts` — extended `MembershipRow`
- `src/renderer/src/features/memberships/build.ts` — extended `buildMembershipRows`
- `src/renderer/src/features/memberships/api.ts` — new API facade
- `src/renderer/src/features/memberships/mutations.ts` — new mutations
- `src/renderer/src/features/memberships/components/cancel-membership-dialog.tsx` — new dialog

### Tests
- `tests/db/migrations.test.ts` — updated for v27
- `tests/domain/membership-cancel-renew.test.ts` — 14 domain tests
- `tests/main/application/membership-cancel-renew.test.ts` — 6 application tests

## Cancellation Reason Codes
COST, RELOCATION, HEALTH, FACILITIES, SERVICE, COMPETITOR, UNUSED, FAMILY, OTHER

## Refund Mechanics
- Staff chooses None/Full/Prorated/Custom
- Prorated = `paid × (unused/total)` capped by refundable
- Split FIFO across payments; atomic in same tx
- Re-derives invoice status after refund

## Renewal Flow
1. Validate customer, plan, dates, overlap
2. Create new membership row (new window, fresh joiningDate)
3. Create invoice (mirrors sell pattern)
4. Optionally record payment
5. Emit `RENEWED` event on source, `CREATED` event on new membership

## Notice Period (NOTICE_DAYS) — Default 14 Days + Override
- Default notice is **14 days** (`DEFAULT_NOTICE_DAYS`); the seeded cancellation policy is `14 Days Notice` (`notice_days = 14`). The `?? 30` fallbacks were swept to `?? 14`. No migration was added — the notice feature never reached production, so no 30-day rows need conversion.
- The cancel dialog shows a **date input** below the timing dropdown when `NOTICE_DAYS` is selected, prefilled with `today + 14` capped at the membership `endDate`. Staff can override the effective date.
- **Override rules** (enforced in `application/memberships.ts`): must be strictly after today, else `ValidationError`; capped at membership `endDate` (domain function `resolveCancellationEffectiveDate`).
- The plan's notice days are now resolved correctly via `cancellationPolicyRepo.getById(plan.cancellationPolicyId)` — the previous code cast the plan to a non-existent `cancellationNoticeDays` field and always fell back to 30.

## Scheduled vs Immediate Refunds (all cancellation timings)
- The refund section is available for **every** timing (IMMEDIATE, END_OF_PERIOD, NOTICE_DAYS) whenever the membership has an invoice; hidden only for EXPIRED (R2.4).
- **Proration basis** (industry standard, research-confirmed): unused days are measured **from the cancellation effective date to the end date** (`refund = paid × unused/total`). So END_OF_PERIOD ≈ ₹0, NOTICE_DAYS = days after the notice ends, IMMEDIATE = today → end date. Freeze-extended end date is honoured (R1.2).
- **Refund timing control** (`refundTiming` on the cancel input):
  - Default for END_OF_PERIOD / NOTICE_DAYS: `ON_EFFECTIVE_DATE` — the refund is **scheduled** to the cancellation effective date (a `SCHEDULED` refund row; money has not left; invoice status unchanged).
  - Option `IMMEDIATE` — issued now (money leaves; invoice status re-derived).
  - IMMEDIATE timing always issues now.
- **`refunds` status model** (migration v29 `refund_scheduling`): `status` (`ISSUED` / `SCHEDULED` / `VOIDED`), `scheduled_date`, `issued_at`.
  - Money-affecting reads (`getByPayment`, `listByPayments`, `listByInvoice`) return **ISSUED only**, so scheduled refunds never reduce refundable or flip invoice status early.
- **`processScheduledRefunds()`** (`application/finance.ts`): issues every due `SCHEDULED` refund (`issued_at = scheduled_date`), then re-derives the affected invoices. Runs at app startup (all orgs, no session needed) and when the Finance → Refunds page opens.
- **Revert**: `revertCancellationRequest` soft-deletes (`VOIDED`) any scheduled refunds tied to the membership — kept on record for audit. Issued refunds stay.
- **Surfaces**: Refunds page shows a "Scheduled" badge (+ scheduled date) and a muted "Voided" badge; metrics/reports count ISSUED only; `exportRefundPdf` is restricted to ISSUED refunds; the cancel dialog toast notes "Refund ₹X scheduled for {date}".

## Refund Receipt PDF
- New individual refund receipt PDF (`pdf:exportRefund`), mirroring the payment receipt. Refund receipts are saved to `Documents/CrownCRM/Refunds/` as `REF-####` documents.
- `exportRefundPdf({ refundId, mode })` in `src/main/application/pdf.ts` hydrates: refund record (`refundRepo.getById`), source payment (method), customer, latest membership name, the invoice(s) the source payment covers, and the recording staff member.
- Template `src/main/pdf/templates/refund-receipt.ts` — red/destructive hero ("Refund Issued", −₹), customer block, against payment + covered invoice(s), reason, recorded by.
- `refundRepo` gained `getById` and `listByInvoice` (refunds across a payment's invoice allocations).

## Refunds on the Invoice PDF
- `exportInvoicePdf` now aggregates refunds for the invoice (`refundRepo.listByInvoice`) and renders a detailed "Refunds Issued" section (REF-####, date, method, reason, amount) plus "Refunded" / "Net Paid" rows in the settlement summary.
- The invoices read model (`ipc/invoices.ts` `buildInvoiceOutput`) now includes `refunds[]` (id, refundNo, refundDate, amountMinor, method, reason, sourcePaymentNo); the renderer `Invoice` type and `invoiceOutputSchema` were extended accordingly.

## Renderer entry points
- Finance → Refunds table: row action downloads the refund receipt.
- Refund detail drawer: "Receipt" button in the header.
- Invoice detail page: new "Refunds issued" section with a download link per refund.

## Amount semantics
- Refunds always reflect what was actually refunded (FULL refund caps at total paid minus prior refunds). The receipt PDF shows the exact stored refund amount — never the membership final price.
