# Module Implementation — Customers & Memberships (Module 02)

**Ties to:** `docs/backend-plan/02-customers-memberships.md`, `docs/02-customers-and-memberships.md`,
`docs/implementation-details/leads-pipeline.md` (customer born from a lead).
**Depends on:** catalog (plans + policy lookups), leads (`leads.customer_id` FK target),
Module 06 `audit_log` (write when available).
**Feeds into:** billing, finance, reference-transactions, read-models.

## 1. Scope & dependencies

**Today:** no backend. Renderer has full mock surfaces: `features/customers/`
(`mock-data.ts`, `api.ts` seam, directory page with status/plan/owner filters) and
`features/memberships/` (flat entitlement view read from `useCustomers`). All data is
in-memory.

**New in this step:** the transactional core of the whole product — `customers`,
`memberships`, `membership_freezes`, `membership_events` — plus the lifecycle commands,
read queries, and the IPC/preload/renderer wiring that replaces the mocks.

The domain model is already authoritative in the renderer types and must be preserved:

```text
MembershipStatus = PENDING | ACTIVE | FROZEN | EXPIRED | CANCELLED | TERMINATED
BillingFrequency = MONTHLY | QUARTERLY | HALF_YEARLY | ANNUAL   (renderer uses ANNUAL;
                backend/doc source uses YEARLY — reconcile in the mapping layer)
FreezeAccessBehavior = NO_ACCESS | ACCESS                         (renderer; backend uses
                LIMITED_ACCESS per docs — map ACCESS ↔ LIMITED_ACCESS)
CustomerStatus = ACTIVE | FROZEN | PENDING | EXPIRED | NONE      (directory derivation)
```

Key rules (docs/02 §7, §32): a membership row is **one purchased entitlement period**,
never overwritten on renewal; `status` is a cached index while the effective state is
derived from dates + open freezes; one customer per person (ADR-0009); membership
commercial terms are a **snapshot** at purchase time, never recomputed from the plan.

## 2. DB tables (`src/main/db/schema/membership.ts`)

```text
customers
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  person_id integer FK people NOT NULL UNIQUE        -- one customer per person (ADR-0009)
  joined_at text NOT NULL                            -- first membership purchase
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  updated_at text NULL
  UNIQUE (organization_id, person_id)
  INDEX (organization_id)

memberships
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  customer_id integer FK customers NOT NULL
  plan_id integer FK membership_plans NULL           -- NULL allowed only for snapshot-only rows
  plan_name text NOT NULL                            -- snapshot; prices change
  base_price_minor integer NOT NULL                  -- snapshot of plan base price
  discount_minor integer NOT NULL DEFAULT 0          -- snapshot
  price_minor integer NOT NULL                       -- effective paid price (base − discount)
  registration_fee_minor integer NOT NULL DEFAULT 0  -- snapshot
  billing_frequency text NOT NULL                    -- MONTHLY|QUARTERLY|HALF_YEARLY|YEARLY
  tax_rate_bps integer NOT NULL DEFAULT 0            -- snapshot from plan at purchase
  start_date text NOT NULL
  end_date text NOT NULL                             -- inclusive; extension writes a NEW row
  status text NOT NULL DEFAULT 'PENDING'             -- cached index; derived state wins
  source_lead_id integer FK leads NULL               -- conversion provenance (Module 01)
  offer_redemption_id integer FK offers/redemptions NULL  -- linked discount, if any
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  CHECK (price_minor = base_price_minor - discount_minor)
  CHECK (end_date > start_date)
  INDEX (organization_id, status), INDEX (organization_id, customer_id), INDEX (organization_id, end_date)

membership_freezes
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  membership_id integer FK memberships NOT NULL
  start_date text NOT NULL
  end_date text NOT NULL
  reason text NOT NULL
  fee_minor integer NOT NULL DEFAULT 0               -- per policy at freeze time
  billing_behavior text NOT NULL                     -- SUSPEND_BILLING|CONTINUE_BILLING
  access_behavior text NOT NULL                      -- NO_ACCESS|LIMITED_ACCESS (renderer maps ACCESS)
  extension_days integer NOT NULL DEFAULT 0          -- days added to end_date (policy)
  policy_id integer FK freeze_policies NULL
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  CHECK (end_date >= start_date)
  INDEX (organization_id, membership_id)

membership_events
  id integer PK AUTOINCREMENT
  organization_id integer FK organizations NOT NULL
  membership_id integer FK memberships NOT NULL
  event_type text NOT NULL      -- CREATED|ACTIVATED|FROZEN|UNFROZEN|RENEWED|PLAN_CHANGED|
                                -- CANCELLATION_REQUESTED|CANCELLED|TERMINATED
  occurred_at text NOT NULL
  payload text NOT NULL DEFAULT '{}'                 -- JSON; snapshot of the change (e.g. new end_date)
  created_by integer FK users NOT NULL
  created_at text NOT NULL DEFAULT datetime('now')
  INDEX (organization_id, membership_id, occurred_at)
```

`ALTER leads` add `customer_id integer FK customers NULL` — set by ConvertLead once
`customers` exist (see reference-transactions).

## 3. Migrations

- Migration 1: `customers` + `memberships` + `membership_freezes` + `membership_events`
  + `leads.customer_id` column + FK.
- No seed data (customers/memberships are business records, not reference data).
- Versions **12+** (11 reserved for catalog completion). Register in `migrations.ts`.

## 4. Backend use cases & queries

Domain state machine (`src/main/domain/membership.ts`): `PENDING → ACTIVE → FROZEN ⇄
ACTIVE → EXPIRED | CANCELLED → TERMINATED`. Only transitions defined in the machine are
legal; anything else throws `InvalidStateTransitionError`. Freeze allowed only while
ACTIVE (renewals/plan changes only while ACTIVE/FROZEN). `reconcileStatus(membership)`:
dates + open freezes recompute the cached index (a job run on reads, so a stale column
self-heals).

Commands (permission-gated, one `withTransaction`):

| Use case | Permission | Rules |
|---|---|---|
| `createCustomer(personId)` | `customer.create` | person must exist + not already have a customer (unique person) |
| `purchaseMembership(customerId, planId, startDate, offerId?)` | `membership.create` | snapshot pricing/tax from plan + policy; `status=PENDING`; `joined_at` set on first; write `CREATED` event |
| `activateMembership(membershipId)` | `membership.update` | PENDING→ACTIVE; write `ACTIVATED` event |
| `freezeMembership(membershipId, range, reason)` | `membership.freeze` | requires ACTIVE; validates freeze-policy (fee, free count/year, extension); writes `membership_freezes` + `FROZEN` event; recomputes status |
| `unfreezeMembership(membershipId)` | `membership.freeze` | FROZEN→ACTIVE; writes `UNFROZEN` event |
| `renewMembership(membershipId, renewalTerm)` | `membership.create` | **new row** with fresh snapshot; old row untouched (history kept); `RENEWED` event on old + `CREATED` on new |
| `changeMembershipPlan(membershipId, newPlanId)` | `membership.update` | proration via `proration_policies` (upgrade credit / downgrade charge); snapshot changes on a new row unless policy says in-place; `PLAN_CHANGED` event |
| `requestMembershipCancellation(membershipId)` | `membership.cancel` | validates `cancellation_policies` (notice days / effective rule); `CANCELLATION_REQUESTED` event; status stays ACTIVE until effective |
| `cancelMembership(membershipId, effectiveAt)` | `membership.cancel` | ACTIVE/FROZEN→CANCELLED at effective date; `CANCELLED` event |
| `terminateMembership(membershipId, reason)` | `membership.cancel` | CANCELLED→TERMINATED (admin only); `TERMINATED` event |

Reads (queries; permission `customer.view` / `membership.view`):

| Query | Returns |
|---|---|
| `getCustomerProfile(customerId)` | customer + people fields + membership summary |
| `getCustomerMemberships(customerId)` | all membership rows (history intact), newest first |
| `getMembershipDetail(membershipId)` | membership + freezes + events + linked invoices (Module 04, when present) |
| `listCustomersPage(filter, page)` | Paged `CustomerRow` with `status` derived now + `currentMembership` + `membershipCount` + `nextExpiry` |
| `listMembershipsPage(filter, page)` | Paged `MembershipRow` (flattened entitlement view) |
| `listActiveMemberships / listExpiringMemberships(window) / listFrozenMemberships / listCancelledMemberships` | used by dashboard + ops |

## 5. IPC channels & contracts

Channels (`src/shared/contracts/ipc.channels.ts`, `CUSTOMER_*` / `MEMBERSHIP_*` namespaces):

```text
customer:create        { personId } → CustomerRow      (customer.create)
customer:profile       { customerId } → CustomerProfile (customer.view)
customer:memberships   { customerId } → MembershipRow[] (customer.view)
customer:list          CustomerPageQuery → Paged<CustomerRow> (customer.view)
membership:list        MembershipPageQuery → Paged<MembershipRow> (membership.view)
membership:detail      { membershipId } → MembershipDetail (membership.view)
membership:purchase    PurchaseMembershipInput → MembershipRow (membership.create)
membership:activate    { membershipId } → MembershipRow (membership.update)
membership:freeze      FreezeInput → MembershipRow (membership.freeze)
membership:unfreeze    { membershipId } → MembershipRow (membership.freeze)
membership:renew       RenewInput → MembershipRow (membership.create)
membership:changePlan  ChangePlanInput → MembershipRow (membership.update)
membership:requestCancellation { membershipId, expectedEndDate? } → MembershipRow (membership.cancel)
membership:cancel      { membershipId, effectiveAt, reason? } → MembershipRow (membership.cancel)
membership:terminate   { membershipId, reason } → MembershipRow (membership.cancel)
```

Contracts in `src/shared/contracts/membership.ts`: `customerRowSchema`, `membershipRowSchema`
(all money as `*_minor` paise ints, dates ISO-UTC text), `purchaseMembershipInputSchema`,
`freezeInputSchema`, page-query schemas reusing `src/shared/contracts/paging.ts` and
`person.ts` refs. Errors: reuse `NOT_FOUND`, `CONFLICT` (duplicate person),
`INVALID_STATE_TRANSITION` (new code), `POLICY_VIOLATION` (freeze fee / notice period).

## 6. Preload API

Extend `window.api.customer` and `window.api.membership` in `src/preload/index.ts` +
`index.d.ts` with one method per channel above, each invoking the channel and returning
the unwrapped `data` (or rejecting with the typed error).

## 7. Frontend fetches

**API layout** — one wire-shape api file per surface (see README "Renderer API layer"):

```text
features/customers/
├── api/
│   ├── customers.api.ts      # create/list/profile/memberships (window.api.customer.*)
│   └── index.ts              # barrel
├── mappers.ts                # wire→display: status/nextExpiry passthrough, customer display
└── queries.ts                # useCustomers/useCustomerProfile/useCustomerMemberships/useCreateCustomer

features/memberships/
├── api/
│   ├── memberships.api.ts    # list/detail + lifecycle: purchase/activate/freeze/unfreeze/
│   │                         # renew/changePlan/requestCancellation/cancel/terminate
│   │                         # (window.api.membership.*)
│   └── index.ts
├── mappers.ts                # wire→display: *_minor→₹, ISO→date, status passthrough
└── queries.ts                # useMembershipsPage/useMembershipDetail + lifecycle mutations
```

- `features/customers/api/customers.api.ts`: replace `mock-data.ts` calls with
  `window.api.customer.*`; methods return the `shared/contracts/membership` wire types
  exactly. Mapping `CustomerRow`: `status` (derived) and `nextExpiry` come from the
  backend row and pass through `mappers.ts`; drop the client-side `effectiveStatus()`
  re-derivation (keep as a display fallback).
- `features/customers/queries.ts`: `useCustomers(pageQuery)` → `useQuery` on
  `customer:list`; `useCustomerProfile(customerId)`, `useCustomerMemberships(customerId)`,
  `useCreateCustomer` (mutation + invalidate `['customers']`).
- `features/memberships/api/memberships.api.ts` (new; page currently reads `useCustomers`
  directly): `window.api.membership.*` calls in wire shape; `queries.ts` gains
  `useMembershipsPage(filter)`, `useMembershipDetail(id)`, and the lifecycle mutations
  (`useFreeze`, `useRenew`, `useChangePlan`, `useCancel`) each invalidating
  `['memberships']` and `['customers']`.
- **Enum reconciliation:** `ANNUAL ↔ YEARLY`, `ACCESS ↔ LIMITED_ACCESS` conversions live
  in `features/memberships/mappers.ts`, not in components.
- Money: backend sends `*_minor`; `features/*/build.ts` converts to whole rupees for the
  existing components (which are rupee-native).

## 8. UI wiring

- Customers directory page keeps its layout/table/filters; `useCustomers` now reads IPC.
- Memberships page keeps its flat table; rows now come from `membership:list`.
- **Add (currently missing):** freeze/unfreeze dialog, renew dialog (term picker, price
  preview from snapshot), change-plan dialog (proration preview), cancel/terminate
  confirmation with policy messaging, and a membership detail drawer showing
  freezes + events timeline.
- Customer detail page gains a "Convert lead / view lead" affordance when
  `source_lead_id` is set, and a "New membership" action that opens purchase flow.
- `CustomerStatus` derivation: reuse the backend `status` value; keep the directory's
  "PENDING/EXPIRED/NONE" presentation untouched.

## 9. Seed & permissions

- Permissions to add: `customer.view/create`, `membership.view/create/update/freeze/cancel`.
  Seed grants: Manager = all; Receptionist = `customer.view/create`,
  `membership.view/create/update/freeze`; Sales = `customer.view`,
  `membership.view` (+`create` when ConvertLead runs). Super roles inherit.
- No default data rows (business records).

## 10. Tests

- **Domain (unit):** state machine transitions + every illegal transition throws;
  `reconcileStatus` recomputes from dates + open freezes.
- **Pricing snapshots (application):** `purchaseMembership` snapshots plan
  price/tax/registration at purchase; later plan price changes do not alter existing rows.
- **Renewal:** `renewMembership` creates a new row, leaves the old intact; `RENEWED` +
  `CREATED` events written.
- **Freeze policy:** fee charged per policy; `freezeCount/year` limit enforced; unfreeze
  clears status back to ACTIVE.
- **Cancellation:** notice-day validation; effective-date rules; request ≠ cancel.
- **Unique person:** second `createCustomer` for a person → `CONFLICT`.
- **Repository + IPC:** org-scoped queries on `:memory:`; handler tests for each channel
  (validation, permission denial, envelope shape).
- **Renderer:** directory lists IPC rows; freeze/renew dialogs invoke the right channel;
  enum mapping round-trips.

## 11. Decisions & open items

1. **`plan_name`/pricing snapshot on the row** (vs. FK join at read): snapshots win —
   membership history must survive plan renames (docs/02 §32). FK to plan kept for
   lineage/navigation only.
2. **Renewal as new row**: confirmed. This is the load-bearing design decision; do not
   "fix" the old row in place.
3. **Status column vs. pure derivation**: keep the cached `status` index but treat it as
   invalidatable — a read-time `reconcileStatus` self-heals stale values so the UI never
   shows a wrong state.
4. **Freeze on EXPIRED/CANCELLED memberships**: disallowed by the machine; expired
   members must renew first. Confirm this matches the gym's real process.
5. **`person_id` uniqueness**: strictly one customer per person. If a gym ever needs two
   customers on one person (rare), revisit with ADR-0009.