# Module Implementation — Reference Transactions (Module 07)

**Ties to:** `docs/backend-plan/07-reference-transactions.md`,
`docs/implementation-details/leads-pipeline.md` (ConvertLead), and the per-entity
use cases defined in customers-memberships / billing / finance / catalog.
**Depends on:** catalog (pricing/policy), customers-memberships, billing, finance.
**Feeds into:** backbone (audit/events record these), read-models (they aggregate the
results), ops (export).

## 1. Scope & dependencies

The vertical slices above expose granular, permission-gated commands. This module is the
**orchestration layer**: it composes those commands into the three real-world flows the
gym performs, so a single operation can never leave the system half-written. It adds **no
new tables** and **no new read models** — it sequences existing use cases inside one
`withTransaction` and publishes domain events (Module 06) afterwards.

Three flows:

1. **ConvertLead / SellMembership** — the lead pipeline's payoff: a lead becomes a
   customer, that customer buys a membership, and the sale is invoiced + paid in one
   atomic step.
2. **Payment** — the front-desk flow: record a payment and allocate it across one or more
   open invoices (or convert leftover to credit).
3. **Freeze** — freeze a membership, applying the freeze policy (fee, extension) and
   recording the freeze event.

These are the operations the reference transaction doc mandates be atomic because a
partial completion is worse than no completion (e.g. customer created but no membership,
or payment recorded but not allocated).

## 2. DB tables

None. All writes flow to the tables defined in Modules 02/04/05. This module owns
**write ordering and invariants only**.

## 3. Migrations

None. This module ships application code + tests only. It may add a permission code
(`sale.execute`) — see §9 — but no schema.

## 4. Backend use cases

Each reference transaction is a single application use case that acquires the transaction
up front and sequences the lower-level commands *in-process* (calling the same repository
functions the single commands use, not nested `withTransaction` calls — the transaction is
already open, so inner calls must be plain repository/domain calls or savepoint-scoped,
never `BEGIN`).

### 4.1 `convertLeadAndSellMembership(input)` — permission `sale.execute`

Write order (one transaction):

1. **Customer** — `createCustomer(lead.personId)`; set `leads.customer_id`; lead → CONVERTED
   (Module 01 status transition), snapshot `convertedAt`.
2. **Membership** — `purchaseMembership(customerId, planId, startDate, offerId?)`
   (snapshot pricing/tax/registration from the plan + policy).
3. **Offer redemption** — if an offer was used, write `offer_redemptions` with the applied
   discount (catalog), decrementing nothing stored (usage is derived).
4. **Invoice** — `createInvoice` + `addInvoiceLine` for the membership term (incl.
   registration fee as its own line), `finalizeInvoice` → gets `INV-YYYY-NNNNNN`.
5. **Payment** — `recordPayment` (method/reference) + `allocatePayment` against the new
   invoice; leftover → `convertOverpaymentToCredit` or stays unallocated (surfaced).

**Invariants:** all-or-nothing. If step 5 fails, no customer, no membership, no invoice
exist. Exactly one customer is created even if the person already had a membership
(renewal — see 4.4) — the flow branches on existing customer.

### 4.2 `recordAndAllocatePayment(input)` — permission `finance.record`

Write order (one transaction):

1. `recordPayment`.
2. `allocatePayment` across the listed invoices (each ≤ outstanding, sum ≤ payment).
3. If remainder > 0 and `convertToCredit` flag set → `convertOverpaymentToCredit`.

**Invariant:** a payment is never partially persisted with unallocated money silently
dropped — the remainder is either converted, allocated elsewhere, or returned to the UI
as unallocated (no write rollback needed; it's a completed, fully-recorded state).

### 4.3 `freezeMembershipFlow(input)` — permission `membership.freeze`

Write order (one transaction):

1. Validate membership ACTIVE + freeze policy (fee, free-count/year, extension rule).
2. `freezeMembership` (writes `membership_freezes`, status recompute, FROZEN event).
3. If `billing_behavior = CONTINUE_BILLING`, create the scheduled/next invoice line for the
   frozen period (billing) — otherwise nothing (suspended).
4. If a freeze fee applies, record a payment/refund line for `fee_minor` (or raise an
   invoice — per policy).

**Invariant:** a freeze either fully lands (freeze row + event + any fee) or rolls back
completely.

### 4.4 Renewal (`renewMembershipFlow`)

Not a separate transaction type — it is the ConvertLead/SellMembership flow re-run for an
existing customer: `purchaseMembership` (new row) + invoice + payment, with the lead
branch skipped. Kept here for test coverage of the "renew" path.

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `SALE_*` / reusing `FINANCE_*` +
`MEMBERSHIP_*` for the standalone flows):

```text
sale:convertAndSell    ConvertAndSellInput → SaleResult   (sale.execute)
finance:recordAndAllocate { payment fields, allocations, convertToCredit? } → PaymentRow (finance.record)
membership:freezeFlow  FreezeFlowInput → MembershipRow     (membership.freeze)
```

`SaleResult` aggregates the created entities: `{ customer, membership, invoice,
payment, credit? }` (money as `*_minor`). Each inner command's contract is reused; the
flow-level contracts are the only new Zod schemas in `src/shared/contracts/sale.ts`.

## 6. Preload API

Add to `window.api.sale` (new) and extend `window.api.membership`/`window.api.finance`:
`convertAndSell`, `recordAndAllocate`, `freezeFlow` — unwrapping `data` or rejecting with
the typed error.

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer");
the flow-level adapters are new files, the granular ones live in their module's `api/`:

```text
features/leads/
├── api/
│   ├── sale.api.ts           # NEW: convertAndSell (window.api.sale.*)
│   └── ...                   # existing leads surface (retrofit deferred — TODO doc)

features/finance/
├── api/
│   ├── payments.api.ts       # + recordAndAllocate flow variant
│   └── ...

features/memberships/
├── api/
│   ├── memberships.api.ts    # + freezeFlow variant
│   └── ...
```

- `features/leads/api/sale.api.ts` — the ConvertLead action on the lead detail /
  bulk-convert flow calls `window.api.sale.convertAndSell` instead of (or in addition to)
  the granular create-customer path; returns the `SaleResult` wire shape; `mappers.ts`
  renders the success toast fields.
- `features/finance/api/payments.api.ts` — `recordAndAllocate` replaces the multi-step
  mock "record then allocate" sequence on the payment dialog.
- `features/memberships/api/memberships.api.ts` — `freezeFlow` replaces the two-step
  freeze + fee path on the freeze dialog.
- Invalidation: after a sale, invalidate `['leads']`, `['customers']`, `['memberships']`,
  `['invoices']`, `['finance']`, `['dashboard']` together (one `invalidateQueries` call),
  so every read model reflects the atomic result.

## 8. UI wiring

- Lead bulk-convert and single-convert now route through the sale flow; the success toast
  shows customer name + invoice number + payment confirmation in one step.
- The finance "record payment" dialog uses `recordAndAllocate` (allocation grid + convert
  leftover toggle) rather than separate record/allocate buttons.
- The freeze dialog shows the policy-derived fee/extension preview and calls
  `freezeFlow`.
- No new screens — this module changes *how* existing buttons behave, making them atomic.

## 9. Seed & permissions

- New permission code: `sale.execute`. Seed: Manager = yes; Receptionist = yes;
  Sales = yes (selling is their primary action). Super roles inherit.
- `finance.record`/`membership.freeze` remain required for the standalone flows; the sale
  flow requires `sale.execute` and internally *does not* re-check the granular codes
  (one permission gate per user-facing operation, not four).

## 10. Tests

- **Scenario tests (the core deliverable):** for each flow, run a happy path and then a
  forced failure at **each** step index; assert the transaction rolled back to the
  pre-flow state (counts of customers/memberships/invoices/payments/allocations/events
  unchanged, `audit_log` empty for the failed attempt). Implemented over the real
  repositories against `:memory:` SQLite with a stub that throws at step N.
- **ConvertAndSell:** full happy path asserts one customer, one membership (PENDING→ACTIVE
  via activation), one numbered invoice, one fully-allocated payment, lead CONVERTED with
  `customer_id` set; offer redemption linked with correct discount.
- **Renewal:** existing customer skips customer creation; new membership row + new invoice;
  old membership untouched.
- **Payment flow:** partial allocation derives PARTIALLY_PAID; convert-to-credit flag
  produces a credit of exactly the remainder.
- **Freeze flow:** billing-suspended vs. billing-continues branches; fee invoice/payment
  when policy charges; rollback on policy-violation.
- **IPC:** handler tests for the three flow channels (validation, permission, envelope).
- **Renderer:** bulk-convert calls the flow channel once; payment dialog single-call.

## 11. Decisions & open items

1. **One gate, not four:** `sale.execute` authorizes the whole convert+sell flow; the
   granular permissions stay for the standalone operations. Confirmed by the docs' framing
   of the sale as one user action.
2. **Inner steps are plain calls, not nested transactions:** the flow owns the open
   transaction; inner "commands" are invoked as domain+repository sequences (or
   savepoint-scoped) so failures roll back everything. This is a hard implementation
   constraint — document it in code so nobody wraps an inner step in its own
   `withTransaction`.
3. **Lead status on failure:** a failed sale must not leave the lead half-converted. The
   lead status transition is inside the transaction too.
4. **Atomic vs. staged UIs:** the renderer previously staged these as multi-button flows
   (create customer → then sell). Post-ship, the staged UIs should be retired in favor of
   the atomic flows; keep the granular dialogs only where a human genuinely does them
   separately (e.g. a later payment on an existing invoice).