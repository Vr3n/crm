# 06 — Backbone: Audit, Aggregates, Services, Commands/Queries, Domain Events

**Ties to:** Modules 06, 11.
**Depends on:** 00–05 (concepts); implemented alongside so every module plugs into it.
**Feeds into:** everything — this is the wiring every other module's code sits in.

## 1. Audit log (Module 06 §37–38, guidelines §20)

`audit_log` is generic and system-facing — it answers "who changed what, when, from
what to what", kept separate from business history (a Freeze row is business history;
the audit row is "user 7 extended the freeze by 15 days").

### Table (`src/main/db/schema/ops.ts`)

```text
audit_log
  id integer PK, organization_id FK,
  actor_user_id FK users NOT NULL,
  action text NOT NULL,              -- e.g. membership.frozen, invoice.finalized (stable codes)
  entity_type text NOT NULL,         -- LEAD / MEMBERSHIP / INVOICE / PAYMENT / ...
  entity_id integer NOT NULL,
  before_data text NULL,             -- JSON of relevant prior values
  after_data text NULL,              -- JSON of relevant new values
  details text NULL,                 -- free context (screen, note)
  created_at text NOT NULL
```

- Written inside the **same transaction** as the operation it records (guidelines §20).
- Indexed by `(organization_id, entity_type, entity_id)` and
  `(organization_id, actor_user_id, created_at)`.
- Never the primary business model; never a substitute for domain history.

## 2. Aggregate boundaries (Module 06 §39)

Repositories follow aggregates, not tables. Initial aggregates and their owned children:

```text
Lead        → lead_activities, lead_followups, lead_stage_history
Customer    → (memberships referenced, not owned)
Membership  → membership_freezes, membership_events
MembershipPlan → membership_plan_versions
Offer       → offer_redemptions
Invoice     → invoice_lines
Payment     → payment_allocations, refunds
```

A use case loads the aggregate, runs domain behavior, persists through the aggregate's
repository — inside one `withTransaction`. Cross-aggregate effects (membership sale
touching Lead + Membership + Invoice + Payment) are coordinated by the application use
case (Module 07), not by one aggregate reaching into another's tables.

### Repository interfaces (guidelines §6)

Meaningful operations, not generic CRUD. Per aggregate:

```text
LeadRepository        getById, getByPersonId, save, listByStage, listOverdueFollowups, ...
CustomerRepository    getById, getByPersonId, save, search
MembershipRepository  getById, getByCustomer, getActiveByDate, save
MembershipPlanRepository  getById, getByName, list, save, deactivate
OfferRepository       getById, getByCode, listValid, save
InvoiceRepository     getById, getByNumber, getByCustomer, listOpen, save
PaymentRepository     getById, getByCustomer, listByDate, save
RefundRepository      getByPayment, save
CreditRepository      getByCustomer, getBalance, save
```

Repository interfaces live in the application/domain boundary; Drizzle implementations
live in `src/main/db/repositories/` (infrastructure). Do not create
`IDatabaseAdapter`/`IOrmAdapter` abstractions (guidelines §27).

## 3. Domain services (Module 06 §40)

```text
MembershipPricingService   (03) — plan + offer → PricingSnapshot
MembershipFreezeService    (02) — applies freeze policy
MembershipRenewalService   (02) — next entitlement period + billing records
InvoiceCalculationService  (04) — line math + totals (integer paise)
PaymentAllocationService   (05) — allocation math, state derivation, overpayment policy
LeadConversionService      (01/07) — orchestrates the sale transaction
```

## 4. Commands vs. queries (Module 06 §41–42, Module 09 §71)

- `src/main/application/` holds command handlers (`*Handler.execute(command)`) and query
  handlers. Folders mirror bounded contexts: `leads/`, `customers/`, `memberships/`,
  `catalog/`, `billing/`, `finance/`.
- Commands mutate, validate, authorize, audit. Queries read (may use optimized SQL /
  read models) and never mutate.
- Only commands go through `requirePermission` + `withTransaction`. Queries check
  read permissions and use the session's org scope.

## 5. Domain events (Module 11 §73, guidelines §19)

Lightweight in-process emitter (Node `EventEmitter`), no event sourcing, no message bus.

- Publish **only after** the transaction commits (guidelines §19):
  `withTransaction(() => {...})` → commit → `eventBus.emit(Event)`.
- Event list (starter, from Module 11): `LeadCreated`, `LeadStageChanged`,
  `LeadConverted`, `MembershipCreated`, `MembershipActivated`, `MembershipFrozen`,
  `MembershipUnfrozen`, `MembershipRenewed`, `MembershipCancelled`, `MembershipExpired`,
  `MembershipPlanChanged`, `InvoiceCreated`, `InvoiceFinalized`, `InvoicePaid`,
  `InvoicePartiallyPaid`, `InvoiceVoided`, `PaymentRecorded`, `PaymentAllocated`,
  `PaymentRefunded`, `CreditIssued`, `CreditApplied`.
- Initial consumers: audit, in-app notifications, read-model refresh, future automation.
- Listeners must be idempotent and safe to run post-commit (a listener failure never
  rolls back the committed business transaction).

## 6. State-transition helper

A small generic transition helper in `src/main/domain/` so every state machine
(Membership, Invoice, Lead flags) is declarative and unit-testable:

```ts
transition(from, to)  // throws InvalidStateTransitionError unless allowed
```

Each module defines its allowed map; the tests assert every diagrammed transition is
allowed and nothing outside it is (Module 11's stated purpose).

## 7. Tests

- Audit: every important command writes exactly one audit row in-transaction; rollback
  also rolls back the audit row.
- Event emission: no events before commit; events emitted after commit; a listener
  throwing does not corrupt state.
- Transition helper: all Module 11 diagrams are legal; illegal transitions throw
  `INVALID_STATE_TRANSITION`.