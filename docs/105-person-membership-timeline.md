# 105 — Person Membership Timeline & Summary Cards

Adds a membership lifecycle **timeline** and enriched **summary cards** (with
joining date, Total/Paid/Outstanding and Cancel/Renew actions) to the person
detail pages — Customer Detail and Lead Detail (via `LeadCommerceCard`).

## Per-membership paid amount: invoice→membership FK

The membership sale/renew flows already create **exactly one invoice per
membership** in the same transaction, but invoices only linked to `customer_id`.
To show a true per-membership **Total / Paid / Outstanding**, a nullable
`membership_id` FK was added to `invoices`:

- **Migration v30** `invoice_membership` — `ALTER TABLE invoices ADD COLUMN
  membership_id INTEGER REFERENCES memberships(id)` + `idx_invoices_membership`.
- **`sellMembership`** and **`renewMembership`** now set `membership_id` on the
  invoice they create.
- **Read model** (`ipc/customers.ts`) gains `buildInvoicesByMembership`, which
  aggregates each membership's invoices + payment allocations (reusing a
  shared `allocationsByInvoice` / `mapInvoicesToOutputs` helper) and attaches
  `invoices[]` to each membership in `Customer.memberships`.
- **Contract** (`shared/contracts/customers.ts`): `MembershipOutput` gains
  `joiningDate` (surfaced from `memberships.joining_date`, previously missing
  from the read model) and `invoices[]`.

**Legacy gap:** invoices created before v30 have `membership_id = NULL`; their
membership cards show "No linked invoice yet" and Paid = 0 until the next
sale/renew. Documented, not silently wrong.

## Renderer

### `MembershipOverviewCard` (enhanced)
- New props `canCancel`, `canRenew`, `onCancel`, `onRenew`.
- Shows the **joining date** (`membership.joiningDate`) next to billing.
- A **Total / Paid / Outstanding** block aggregated from `membership.invoices`
  via the pure `membershipBillingTotals` helper (`customers/membership-billing.ts`).
- **Cancel** and **Renew** actions (gated by the caller's permission check).

### `RenewMembershipDialog` (new)
- Drives the existing `renewMembership` command (`useRenewMembership`).
- Defaults plan from the current membership, dates from continuation after its
  end, base price from the plan; mirrors the sale form's pricing/date/payment
  fields (TanStack Form + `CatalogDatePicker` + `PAYMENT_METHODS`).

### `MembershipTimeline` (wired)
- Reuses the generic `Timeline`; each membership is an entry labelled
  **Bought** (first) or **Renewed** (later periods), with a status badge
  (ACTIVE / CANCELLED / TERMINATED) and the billed Total/Paid in the meta line.

### Detail pages
- **Customer Detail**: Row 4 gains `MembershipTimeline`; each
  `MembershipOverviewCard` gets cancel/renew wired via `CancelMembershipDialog`
  (existing) + `RenewMembershipDialog` (new), gated by `membership.cancel` /
  `membership.renew`.
- **Lead Detail**: `LeadCommerceCard` mirrors the same (timeline + cancel/renew)
  for converted leads.

## Files changed

- `src/main/db/migrations/20260908160000_invoice_membership/migration.sql` + `migrations.ts` (v30)
- `src/main/db/schema/billing.ts` — `membership_id` FK + index
- `src/main/application/memberships.ts` — set FK on sell/renew
- `src/main/repositories/billing.ts` — `invoiceRepo.getByMembership`
- `src/main/ipc/customers.ts` — `joiningDate` + per-membership invoices
- `src/shared/contracts/customers.ts` — `joiningDate` + `invoices` on membership
- `src/renderer/src/features/customers/types.ts` — `joiningDate` + `invoices`
- `src/renderer/src/features/customers/membership-billing.ts` — **new** totals helper
- `src/renderer/src/features/customers/components/detail/membership-overview-card.tsx` — joining/paid/actions
- `src/renderer/src/features/customers/components/detail/membership-timeline.tsx` — bought/renewed/canceled
- `src/renderer/src/features/memberships/components/renew-membership-dialog.tsx` — **new**
- `src/renderer/src/features/customers/pages/CustomerDetailPage.tsx` — timeline + actions
- `src/renderer/src/features/leads/components/detail/lead-commerce-card.tsx` — timeline + actions

## Tests

- `tests/renderer/membership-billing.test.ts` — `membershipBillingTotals` aggregation + legacy zeros.
- `tests/main/application/memberships.test.ts` — sell invoice `membership_id` FK assertion.
- `tests/db/migrations.test.ts` — v30 registered + version lists.