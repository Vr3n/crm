# Membership Cancellation & Renewal — Implementation Plan

**Status**: Plan (grilling complete, decisions locked)
**Scope**: Full-stack — schema, domain, application, IPC, preload, renderer UI, tests
**Docs**: `docs/02-customers-and-memberships.md`, `docs/followup-cancel-reason.md`, `docs/backend-implementation-guidelines.md`, `docs/form-implementation-guideline.md`

---

## 1. What already exists (verified)

| Layer | Item | Location |
|---|---|---|
| Schema columns | `cancellation_requested_at`, `cancellation_effective_date`, `cancellation_reason` on `memberships` | `src/main/db/schema/membership.ts:80-83` |
| Event types | `CANCELLATION_REQUESTED`, `CANCELLED`, `RENEWED` in `MembershipEventType` | `src/main/domain/membership.ts:15-25` |
| Permissions | `MEMBERSHIP_RENEW`, `MEMBERSHIP_REQUEST_CANCELLATION`, `MEMBERSHIP_CANCEL` (seeded, unused) | `src/main/db/seed.ts:60-63` |
| Error code | `MEMBERSHIP_CANNOT_BE_CANCELLED` | `src/shared/contracts/errors.ts:23` |
| Cancellation policies | `cancellation_policies` table + `SEED_CANCELLATION_POLICIES` (IMMEDIATE / END_OF_PERIOD / NOTICE_DAYS=30) | `src/main/db/schema/catalog.ts:267-291`, `src/main/db/seed.ts:97-133` |
| Plans link | `plans.cancellation_policy_id` references `cancellation_policies` | `src/main/db/schema/catalog.ts:286` |
| Refund machinery | `issueRefund` (finance.ts:394), `refunds` table, `REFUND_EXCEEDS_PAYMENT`, `getInvoicePaymentState`, `PaymentAllocationService` | `src/main/application/finance.ts` |
| Invoice ↔ membership | `sellMembership` writes `CREATED` event with `data: { invoiceId }` | `src/main/application/memberships.ts:545` |

**Nothing is implemented** — no cancel/renew backend, IPC, preload, or UI.

---

## 2. Locked decisions (post-grilling)

| # | Decision | Locked answer |
|---|---|---|
| R1.1 | One command or two | **One** `cancelMembership` with `timing: IMMEDIATE \| END_OF_PERIOD \| NOTICE_DAYS`; refund only when IMMEDIATE. `MEMBERSHIP_REQUEST_CANCELLATION` permission dropped; single `MEMBERSHIP_CANCEL` gate |
| R1.2 | Frozen membership cancel | Prorate against **freeze-extended** end date; **auto-close** open freeze rows (end=today) in same tx; freeze fee non-refundable |
| R1.3 | Derive vs self-heal | **Derive at read only** — no `reconcileStatuses` writes; `deriveMembershipStatus` + renderer `effectiveStatus` gain `cancellationEffectiveDate` check |
| R1.4 | Lineage column vs events | **Events only** — drop `renewed_from_membership_id`; `RENEWED` (old, `data.newMembershipId`) + `CREATED` (new, `data.renewedFromMembershipId`) |
| R1.5 | Open invoice balance on cancel | **Left intact** — refund returns part of paid; OPEN balance stays due; no write-off logic |
| R2.1 | Cancel EXPIRED | **Yes, reason-only** — sets reason code/detail + event, status stays EXPIRED, refund section disabled (service fully consumed) |
| R2.2 | Renew source rows | **Any source**: ACTIVE, EXPIRED, or CANCELLED; overlap guard governs the new window |
| R2.3 | Renewal joining_date | **Fresh input per renewal** (default = startDate) — `joining_date` is per-period service-start, independent of invoice/payment date |
| R2.4 | Legacy rows, no invoice | **Refund disabled, cancel proceeds** — `refundState` returns null invoice + zero refundable |
| R2.5 | Canonical names | **request / execute / revert**; `CANCELLATION_REVERTED` event; "Undo" allowed as UI label only |

### Glossary (additions to `plans/CONTEXT.md` vocabulary)

| Canonical term | Meaning | Storage |
|---|---|---|
| **Cancellation Execution** | Immediate cancel — status → CANCELLED, effective date = today, optional refund. Executed under `MEMBERSHIP_CANCEL`. | `status = 'CANCELLED'`, cancellation fields set |
| **Cancellation Request** | Scheduled cancel — cancellation fields set, effective date = future, status unchanged (derived). Same permission. | cancellation fields set, `status` unchanged |
| **Cancellation Revert** | Withdraw a pending request before effective date — clear cancellation fields, status unchanged. Same permission. | cancellation fields cleared |
| **Joining Date** | The date the customer starts using gym services under *this* membership period. Independent of invoice/payment date (pay Saturday, start Monday). | `memberships.joining_date` (per-period, not per-person) |
| **Prorated Refund** | `paid_to_date × (unused_days / total_days)`, capped by refundable payment balance. Only on IMMEDIATE execution. | Derived; not stored |

---

## 3. Schema & migration

### Migration `20260908120000_membership_cancel_renew` (version 29)

File: `src/main/db/migrations/20260908120000_membership_cancel_renew.sql`

```sql
-- Structured cancellation reason code
ALTER TABLE memberships ADD COLUMN cancellation_reason_code TEXT;
```

That's it — no `renewed_from_membership_id` (R1.4: events only).

Register in `src/main/db/migrations.ts` (array index 28, version 29).

Update `src/main/db/schema/membership.ts`: add `cancellationReasonCode: text('cancellation_reason_code')`. Update `src/main/db/schema/index.ts` exports.

---

## 4. Domain (`src/main/domain/membership.ts`)

### 4.1 New types

```ts
export type CancellationReasonCode =
  | 'COST' | 'RELOCATION' | 'HEALTH' | 'FACILITIES'
  | 'SERVICE' | 'COMPETITOR' | 'UNUSED' | 'FAMILY' | 'OTHER'

export type CancellationTiming = 'IMMEDIATE' | 'END_OF_PERIOD' | 'NOTICE_DAYS'
```

Add `'CANCELLATION_REVERTED'` to `MembershipEventType`.

### 4.2 Status derivation

Extend `deriveMembershipStatus` with optional `cancellationEffectiveDate` parameter:

```
if (cancellationEffectiveDate && cancellationEffectiveDate <= today) → CANCELLED
```

Evaluated before the EXPIRED check. Existing callers unaffected (optional param).

### 4.3 Pure helpers

- `calculateProratedRefund({ paidMinor, usedDays, totalDays })` → `Math.round(paidMinor × unusedDays / totalDays)`, clamped `[0, paidMinor]`
- `resolveCancellationEffectiveDate(timing, noticeDays, endDate, today)`:
  - `IMMEDIATE` → `today`
  - `END_OF_PERIOD` → `endDate`
  - `NOTICE_DAYS` → `today + noticeDays`
- `isPendingCancellation(cancellationRequestedAt, cancellationEffectiveDate)` → true when both set and effectiveDate > today

### 4.4 State machine

No new statuses. Transitions:
- ACTIVE/FROZEN → CANCELLED (immediate execution)
- ACTIVE/FROZEN → "pending" (cancellation fields set, status unchanged — derived at read time)
- Pending → reverted (fields cleared + `CANCELLATION_REVERTED` event)
- EXPIRED → reason-only (sets reason code/detail, no status change, refund disabled)

`assertValidTransition` unchanged.

---

## 5. Application layer (`src/main/application/memberships.ts`)

### 5.1 `cancelMembership(input)` — single command (R1.1)

- **Permission**: `membership.cancel` (+ `REFUND_CREATE` when timing = IMMEDIATE and `refund.mode !== 'NONE'`)
- **Validates**: membership exists, org-scoped, status ACTIVE/FROZEN/EXPIRED
- **Reason**: `reasonCode` (required), `reasonDetail` (optional, ≤500 chars) — always written regardless of timing
- **Timing dispatch**:

| Timing | Effective date | Status change | Refund |
|---|---|---|---|
| `IMMEDIATE` | today | → CANCELLED | Staff chooses: NONE / FULL / PRORATED / CUSTOM |
| `END_OF_PERIOD` | plan's endDate | unchanged (derived) | disabled |
| `NOTICE_DAYS` | today + policy.notice_days | unchanged (derived) | disabled |

- **Frozen membership handling** (R1.2):
  - Prorated refund base = freeze-extended end date (not original)
  - Auto-close open freeze rows in same tx: `UPDATE membership_freezes SET end_date = today WHERE membership_id = ? AND end_date > today`
  - Freeze fee already paid is non-refundable
- **EXPIRED handling** (R2.1): reason-code only, refund section disabled, event written for churn analytics
- **Legacy rows / no invoice** (R2.4): `refundState` returns `{ invoiceId: null, refundableMinor: 0 }`; dialog hides refund modes except NONE
- **Refund flow** (when timing = IMMEDIATE and mode ≠ NONE):
  - Resolve invoice via `CREATED` event `data.invoiceId`; if none → `refundState.invoiceId = null`, proceed without refund
  - Collect payments allocated to it, compute available balance per payment (payment amount − existing refunds)
  - Validate amount: FULL = all available; PRORATED = `calculateProratedRefund` using freeze-extended end date; CUSTOM = staff amount, capped by total refundable → `REFUND_EXCEEDS_PAYMENT` if exceeded
  - Split across payments FIFO, `refundRepo.create` each with reason `"Membership cancellation — <plan> (<detail>)"`
  - Re-derive affected invoice statuses (reuse `issueRefund` pattern)
- **Event**: `CANCELLED` (execution) or `CANCELLATION_REQUESTED` (scheduled) with `data: { timing, effectiveDate, reasonCode }`
- **Open invoice balance** (R1.5): left intact — refund returns part of paid; OPEN balance stays due; no write-off

### 5.2 `revertCancellationRequest(input)`

- **Permission**: `membership.cancel`
- **Validates**: ACTIVE/FROZEN + `cancellation_requested_at` is set + `cancellation_effective_date > today`
- **Writes**: clear `cancellation_requested_at`, `cancellation_effective_date`, `cancellation_reason_code`, `cancellation_reason`
- **Event**: `CANCELLATION_REVERTED`

### 5.3 `renewMembership(input)`

- **Permission**: `membership.renew`
- **Mirrors** `sellMembership` but customer-driven (no lead selection):
  - Validate customer, plan (active), offer (same rules as sale), dates, pricing (`calculateSalePricing`), payment
  - **`joiningDate`**: fresh input, defaults to `startDate` — per-period service-start, independent of invoice/payment date (R2.3)
  - **Overlap guard**: reject if start/end window overlaps an existing ACTIVE/FROZEN membership (`CONFLICT`)
  - **Source row**: any status — ACTIVE, EXPIRED, or CANCELLED (R2.2)
  - **Blacklist check**: reuse existing `checkBlacklist`
  - New membership row `status = 'ACTIVE'` with fresh snapshots
  - New invoice + line + number + optional payment/allocation
  - Offer redemption if any (same `paymentMethods.ts` logic)
  - Events: `RENEWED` on old membership (`data: { newMembershipId, invoiceId }`), `CREATED` on new one (lineage via events only, R1.4)
  - Idempotency via `transactionId` (reuse `idempotency_keys`)
- **Returns**: `{ membershipId, invoiceId, invoiceNumber, paymentId }`

### 5.4 `getMembershipRefundState({ membershipId })`

- **Permission**: `payment.view` + `refund.view`
- **Returns**: `{ invoiceId, invoiceNo, totalPaidMinor, refundedMinor, refundableMinor, proratedSuggestedMinor, payments: [{ paymentId, amountMinor, availableMinor }] }`
- When no invoice exists (legacy/comp) (R2.4): returns `{ invoiceId: null, refundableMinor: 0, payments: [] }`
- **Purpose**: feeds the cancel dialog's refund section live math

### 5.5 Repository additions (`repositories/membership.ts`)

- `setCancellation(orgId, id, { effectiveDate, reasonCode, reasonDetail })`
- `clearCancellation(orgId, id)`
- `closeOpenFreezes(orgId, membershipId, today)` — auto-close freeze rows on immediate cancel
- `getOverlappingActive(orgId, customerId, startDate, endDate, excludeId?)` — overlap check
- `getSourceInvoiceId(membershipId)` — reads `CREATED` event, parses `data.invoiceId`
- **No `reconcileStatuses`** — status is derived at read time (R1.3)

---

## 6. Contracts + IPC + preload

### 6.1 New contract file (`src/shared/contracts/membership.ts`)

- `CANCELLATION_REASON_CODES` const + `cancellationReasonCodeSchema` (zod enum)
- `CANCELLATION_TIMING` const + `cancellationTimingSchema` (zod enum: IMMEDIATE | END_OF_PERIOD | NOTICE_DAYS)
- `membershipIdRequestSchema` `{ membershipId: z.number() }`
- `cancelMembershipInputSchema`:
  ```ts
  {
    membershipId: number
    timing: CancellationTiming         // pre-selected from plan's cancellation policy, staff can override
    reasonCode: CancellationReasonCode
    reasonDetail?: string | null        // max 500
    refund: {
      mode: 'NONE' | 'FULL' | 'PRORATED' | 'CUSTOM'
      amountMinor?: number              // required when CUSTOM
    } | null                            // null or mode=NONE when timing ≠ IMMEDIATE
  }
  ```
- `revertCancellationInputSchema` `{ membershipId }`
- `renewMembershipInputSchema`:
  ```ts
  {
    customerId: number
    planId: number
    offerId?: number | null
    joiningDate: string                 // YYYY-MM-DD, default = startDate
    startDate: string
    endDate: string
    basePriceMinor: number
    discountType: string | null
    discountValueMinor: number | null
    paidAmountMinor: number
    paymentMethod: string
    transactionId: string               // uuid
  }
  ```
- `renewMembershipResultSchema` `{ membershipId, invoiceId, invoiceNumber, paymentId }`
- `membershipRefundStateSchema` `{ invoiceId, invoiceNo, totalPaidMinor, refundedMinor, refundableMinor, proratedSuggestedMinor, payments: [...] }`

### 6.2 IPC channels (`src/shared/contracts/ipc.channels.ts`)

```
MEMBERSHIPS_CANCEL              = 'memberships:cancel'
MEMBERSHIPS_UNDO_CANCELLATION   = 'memberships:undo-cancellation'
MEMBERSHIPS_RENEW               = 'memberships:renew'
MEMBERSHIPS_REFUND_STATE        = 'memberships:refund-state'
```

Dropped: `MEMBERSHIPS_REQUEST_CANCELLATION` (R1.1: single command).

### 6.3 IPC handlers (`src/main/ipc/memberships.ts`)

Register new handlers using `handle(channel, schema, fn)` pattern (handle.ts:35-36).

### 6.4 Preload bridge (`src/preload/index.ts` + `index.d.ts`)

Extend `memberships` namespace:
```ts
cancel: (input) => invoke(MEMBERSHIPS_CANCEL, input)
undoCancellation: (input) => invoke(MEMBERSHIPS_UNDO_CANCELLATION, input)
renew: (input) => invoke(MEMBERSHIPS_RENEW, input)
refundState: (input) => invoke(MEMBERSHIPS_REFUND_STATE, input)
```

Dropped: `requestCancellation` (R1.1: single command).

### 6.5 Customer read model (`ipc/customers.ts` + `shared/contracts/customers.ts`)

Extend `membershipOutputSchema` with:
```ts
cancellationRequestedAt: string().nullable().optional()
cancellationEffectiveDate: string().nullable().optional()
cancellationReason: string().nullable().optional()
cancellationReasonCode: string().nullable().optional()
```

Dropped: `renewedFromMembershipId` (R1.4: events only).

Map in `buildCustomerOutput`.

---

## 7. Renderer

### 7.1 Types + helpers

- **`features/memberships/types.ts`**: add cancellation fields to `Membership` type
- **`features/customers/build.ts`**: extend `effectiveStatus` with `cancellationEffectiveDate` param; add `isPendingCancellation(m)` helper
- **`features/customers/types.ts`**: add cancellation fields to `CustomerMembership`

### 7.2 Data fetching + mutations

File: `features/memberships/api.ts` (thin facade) + `features/memberships/queries.ts`

Mutations:
- `useCancelMembership` — invalidate `['customers']`, `['memberships']`, `['invoices']`, `['payments']`, `['refunds']`
- `useRevertCancellation` — invalidate `['customers']`, `['memberships']`
- `useRenewMembership` — invalidate `['customers']`, `['memberships']`, `['invoices']`, `['payments']`, `['refunds']`

Query:
- `useMembershipRefundState(membershipId)` — for the cancel dialog refund section

### 7.3 Dialogs

Both use TanStack Form + shadcn `Dialog`/`FormField`/`FieldGroup`/`LoadingButton`, `React.lazy` + `<Suspense>` (per `docs/form-implementation-guideline.md`).

#### `CancelMembershipDialog`

Single dialog handles all three paths (R1.1):

Sections:
1. **Timing**: radio group — "Cancel immediately" / "Cancel at end of period" / "Cancel after notice period" (pre-selected from plan's `cancellationPolicyId` via `catalog.listPolicyLookups`). Effective date summary line updates reactively.
2. **Reason**: select from `CANCELLATION_REASON_CODES` + optional free-text detail textarea (max 500).
3. **Refund** (shown only when timing = "Immediately" AND invoice exists):
   - Mode: radio — None / Full / Prorated by unused days / Custom
   - Suggested prorated amount displayed live from `refundState.proratedSuggestedMinor`
   - Custom amount input (when CUSTOM) capped by `refundableMinor`
   - Source payment availability shown in `labelEnd`
4. **Confirm** button (destructive variant)

When membership status is EXPIRED (R2.1): timing section hidden (effective = past), refund section hidden, dialog becomes reason-only.

#### `RenewMembershipDialog`

Sections:
1. **Plan**: combobox picker, defaults to current plan (fetched via `catalog.getPlan`)
2. **Dates**: joining date (default = start), start date (default = old `end + 1`), end date auto-derived from plan duration, editable
3. **Pricing**: base price from plan (editable), optional offer picker (filtered by `applicable_plan_ids`), discount derived, final price reactive
4. **Payment**: amount (default = final price), method dropdown, date (default today)
5. **Submit** button

Post-submit: navigate to membership detail / show success notification.

### 7.4 UI placement

| Location | Component | Actions |
|---|---|---|
| Customer 360 — current membership card | `CurrentMembershipCard` | **Renew** (primary), **Cancel** (destructive) buttons when ACTIVE/FROZEN/EXPIRED; pending-cancel banner ("Cancellation effective <date>" + **Undo**) when pending |
| Customer 360 — membership history cards | `MembershipOverviewCard` | **Renew** for terminal memberships (EXPIRED, CANCELLED) |
| MembershipsPage — table rows | Membership list | **Renew** / **Cancel** action menu for ACTIVE/FROZEN/EXPIRED |

Permissions gated: `MEMBERSHIP_RENEW` for Renew, `MEMBERSHIP_CANCEL` for Cancel.

Use `design-taste-frontend` + `high-end-visual-design` skills (per AGENTS.md) when building UI.

---

## 8. Tests

### 8.1 Domain (`tests/domain/`)

- `calculateProratedRefund` — rounding, clamp, zero/edge cases
- `resolveCancellationEffectiveDate` — each timing value
- `deriveMembershipStatus` with pending/reached cancellation
- `isPendingCancellation` — various date combos

### 8.2 Application (`tests/main/application/memberships.test.ts`)

Extend existing test harness (`tests/helpers/sales-db.ts: setupSalesDb, seedOrgWithSession`):

- Cancel immediate + refund issued against right payment + events
- Cancel immediate + frozen membership: proration uses extended end date, freezes auto-closed
- Cancel with no invoice (legacy/comp): refund section disabled, cancel proceeds
- Over-refund → `REFUND_EXCEEDS_PAYMENT`
- End-of-period request keeps ACTIVE + records fields
- Cancel EXPIRED: reason-only, no refund, event written
- Undo (revert) clears cancellation fields
- Renew creates new row/invoice/payment, old untouched, `RENEWED` + `CREATED` events
- Renew from any source (ACTIVE, EXPIRED, CANCELLED)
- Renew overlap blocked → `CONFLICT`
- Renew blacklist blocked
- Permission denied for each use case
- Idempotent renew returns cached result

### 8.3 Repository/IPC

- Org-scoped queries (org A can't see org B)
- Handler validation (`handle` wraps `VALIDATION_ERROR`)
- Preload types compile

### 8.4 Renderer

- `effectiveStatus` / `isPendingCancellation` with various date combos
- Dialog payloads (TanStack Form validation)

---

## 9. Documentation

Write `docs/membership-cancellation-renewal-implementation.md` (style of `docs/followup-cancel-reason.md`):
- Decisions & rationale
- Schema diff
- Use cases (cancel / revert / renew / refundState)
- Contracts & IPC
- UI specs
- Test coverage
- Verification steps

---

## 10. Verification checklist

1. `npm run typecheck` — no errors
2. `npm run lint` — clean
3. `npx vitest run` — all pass
4. Self-review using `drizzle`, `react-patterns`, `tanstack-query` skills
5. Refactor for performance/readability

---

## 11. Open items

| Item | Status | Notes |
|---|---|---|
| ~~Renew from EXPIRED on MembershipsPage~~ | **Resolved (R2.2)** | Renew source = any status (ACTIVE, EXPIRED, CANCELLED) |
| ~~`renewed_from_membership_id` FK~~ | **Resolved (R1.4)** | Dropped — events only |
| ~~Refund split across multiple payments~~ | **Resolved (R1.5)** | FIFO split in same tx |
| ~~Notice period source~~ | **Resolved (R1.1)** | `cancellation_policies.notice_days` from plan; `NOTICE_DAYS` timing option in dialog |
| ~~Derived vs self-heal status~~ | **Resolved (R1.3)** | Derive at read only; no reconcileStatuses writes |
| ~~Frozen membership cancel~~ | **Resolved (R1.2)** | Prorate on extended end, auto-close freezes |
| ~~Cancel EXPIRED~~ | **Resolved (R2.1)** | Reason-only, refund disabled |
| ~~Renewal joining_date~~ | **Resolved (R2.3)** | Fresh input, default = startDate |
| ~~Legacy rows no invoice~~ | **Resolved (R2.4)** | Refund disabled, cancel proceeds |
| ~~Language~~ | **Resolved (R2.5)** | request / execute / revert |
