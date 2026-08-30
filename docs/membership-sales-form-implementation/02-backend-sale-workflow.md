# 02 — Membership Sale Backend Workflow

**Status:** Partial implementation in progress
**Scope:** Backend foundation for the Membership Sale workflow.

This document records the backend work implemented from `plans/membership-form-backend-questions.md` and the approved Membership Sale plan. It intentionally distinguishes completed backend pieces from the remaining integration work.

## Decisions implemented

### Plan A identity model

The existing `people` table remains the persistence anchor. A sale receives only `leadId`; the application resolves:

```text
Lead → people.id → Customer
```

The sale API does not expose or accept `personId`. This preserves the existing structural model in `sales.ts` and `membership.ts`, including `UNIQUE(organization_id, person_id)` on customers.

### `NONE` discount

`NONE` is a transport/UI value, not a catalog offer type. It means:

```text
offerId = null
```

The shared contract rejects a non-null discount value when the type is `NONE`. Catalog offers remain limited to the four persisted types already defined by the catalog module.

### Pricing authority

`src/main/domain/pricing.ts` contains pure pricing logic. It works in integer paise and supports:

- `NONE`
- `PERCENTAGE`
- `FIXED_AMOUNT`
- `OVERRIDE_PRICE`

Percentage calculations use `Math.round`, representing the agreed nearest-minor-unit rounding rule. The frontend may preview values, but the application layer must recalculate them before persistence.

### Trial and overpayment policy

Trials are not created by Membership Sale. A zero final price is rejected with guidance to use the separate Trial workflow.

Overpayment is rejected with `OVERPAYMENT_NOT_ALLOWED`. Credits are intentionally not created in this slice because the approved decision deferred credit handling to the dedicated payment-collection workflow.

### Idempotency

`idempotency_keys` was added with a unique `(organization_id, key)` constraint. `transactionId` is supplied by the sale contract and is checked before execution and again inside the transaction. A completed response is returned for a repeated key.

This follows the Stripe-style idempotency model while remaining local to the organization and SQLite installation.

## Schema and migration changes

### Organization

`organizations.org_invoice_prefix` was added to the Drizzle schema. The sale fallback derives up to three initials from the organization name when the setting is empty.

`organizations.timezone` already existed in the current schema and is preserved for future organization-local date handling.

### Idempotency table

`src/main/db/schema/idempotency.ts` defines:

```text
id
organization_id
key
response
created_at
```

Migration `20260823150000_membership_sale_idempotency` creates this table and the organization prefix column. Migration `20260823160000_membership_sell_permission` adds `membership.sell` and grants it to Manager and Sales roles for existing organizations.

Both migrations are registered as versions 16 and 17 in `src/main/db/migrations.ts`.

## Shared transport contract

`src/shared/contracts/membership-sale.ts` defines:

```text
leadId
planId
offerId
startDate
endDate
basePriceMinor
paidAmountMinor
paymentMethod
transactionId
```

The contract validates IDs, integer money values, date-only values, supported discount types, payment methods, UUID transaction IDs, and the `NONE` discount invariant.

`MEMBERSHIPS_SELL` was added to `src/shared/contracts/ipc.channels.ts`.

## Application workflow

`src/main/application/memberships.ts` contains the initial `sellMembership` use case. It follows this intended sequence:

```text
permission check
  ↓
idempotency lookup
  ↓
validate Lead, Person, Plan, Offer, dates, pricing, payment
  ↓
BEGIN IMMEDIATE via withTransaction
  ↓
find/create Customer
  ↓
create Membership with commercial snapshots
  ↓
create Invoice DRAFT + InvoiceLine
  ↓
allocate invoice number and finalize invoice
  ↓
create Payment + PaymentAllocation
  ↓
convert Lead to Customer/WON
  ↓
record MembershipEvent and OfferRedemption
  ↓
store idempotency response
  ↓
COMMIT
```

All values are organization-scoped through the current session. The sale does not trust frontend-derived totals or date validity.

Membership snapshots include plan name, actual sold base price, discount, final price, tax rate, billing frequency, start date, end date, and inclusive duration days.

Invoice lines preserve the plan name/date description and financial values independently of later catalog changes.

## IPC and renderer bridge

The following wiring has been added:

- `src/main/ipc/memberships.ts`
- registration in `src/main/index.ts`
- `window.api.memberships.sell` in `src/preload/index.ts`
- preload type declaration in `src/preload/index.d.ts`
- renderer facade `src/renderer/src/features/memberships/sale/api.ts`
- renderer mutation `src/renderer/src/features/memberships/sale/queries.ts`

The sale page now converts rupee strings to paise at submit time and sends a transaction ID. The renderer mutation invalidates lead, customer, membership, invoice, and payment query families after success.

## Tests added

`tests/domain/membership-sale-pricing.test.ts` covers:

- `NONE` pricing
- rejection of a value with `NONE`
- percentage rounding
- fixed discount overflow
- override-price calculation
- inclusive date duration
- malformed date rejection

Command:

```bash
npx vitest run tests/domain/membership-sale-pricing.test.ts
```

Result: 7 tests passing.

## Remaining integration work

The following must be completed before this workflow is production-ready:

- Add application-level tests using an isolated SQLite database for full atomic sale behavior.
- Add repository tests for idempotency uniqueness and organization isolation.
- Ensure invoice numbering uses a collision-safe, transaction-local sequence operation.
- Add membership event and audit assertions to the transaction tests.
- Resolve existing repository/application type issues and run the complete test suite.
- Verify payment allocation against the finalized invoice total, including tax policy.
- Add the frontend inline error mapping for stable error codes.
- Add renderer integration tests for the actual sale mutation payload.
- Verify organization setup and settings persist the invoice prefix and timezone defaults.
- Review the current invoice schema requirement for temporary draft numbers before production finalization.

## Verification status

The isolated pricing/domain test passes. Full `npm run typecheck` remains blocked by pre-existing finance/dashboard/preload errors, and the full Membership Sale backend workflow should not be considered complete until the integration tests and the remaining items above are addressed.

## References

- `plans/membership-form-backend-questions.md`
- `plans/membership-sale-form/00-overview-and-glossary.md`
- `plans/membership-sale-form/02-lead-and-plan-selection.md`
- `plans/membership-sale-form/03-offer-and-pricing-engine.md`
- `plans/membership-sale-form/04-dates-and-timezone.md`
- `plans/membership-sale-form/05-payment-and-overpay.md`
- `docs/backend-implementation-guidelines.md`
- `docs/backend-plan/00-foundation.md`
- `docs/backend-plan/02-customers-memberships.md`
- `docs/backend-plan/04-billing.md`
- `docs/backend-plan/05-finance.md`
- `docs/backend-plan/07-reference-transactions.md`
