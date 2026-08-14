# Module 11 — State Machines & Domain Events

**Bounded context:** cross-cutting reference — the canonical state diagrams and event list every module implementation should match exactly.
**Depends on:** Modules 01, 02, 04 (this formalizes their lifecycles).

## Why collect these in one place instead of leaving them scattered per-module

When "what states can a Lead/Membership/Invoice be in, and what triggers each transition" lives only inside prose in each module, two developers implementing related features (e.g., one building Freeze, another building Cancellation) can easily end up with subtly incompatible assumptions about valid states. A single authoritative state-machine reference, reviewed once, removes that ambiguity — and doubles as the direct source for unit tests ("assert every transition in this diagram is possible, and no transition outside it is").

## Worked example: why Domain Events matter even in a single-process desktop app

```text
Event: MembershipActivated { membership_id, customer_id, occurred_at }

Without an event system:
  The "activate membership" code has to directly know about and
  call: update dashboard cache, maybe queue a welcome-note reminder,
  maybe update sales-funnel stats — all hard-coded inline.

With a simple in-process event emitted after the transaction commits:
  MembershipService.activate() commits the transaction, then emits
  MembershipActivated. Separate, independent listeners react:
    - DashboardCache listens → refreshes "active members" count
    - FollowUp module listens → creates a "Welcome call" follow-up
  Neither listener needs to be known to MembershipService itself.
```

Even without microservices or a message queue, a lightweight in-process event emitter (e.g., Node's `EventEmitter`) keeps modules decoupled: the Membership module doesn't need to import the Follow-up module just to create a welcome-call reminder. This becomes increasingly valuable as more modules are added (Module 13, "Future Modules").

---

# 72. Recommended State Machines

The following state machines should be explicitly documented in code.

## Lead

```text
NEW
CONTACTED
INTERESTED
VISIT_SCHEDULED
VISITED
TRIAL
NEGOTIATION
WON
LOST
```

## Membership

```text
PENDING
ACTIVE
FROZEN
EXPIRED
CANCELLED
TERMINATED
```

## Invoice

```text
DRAFT
OPEN
PARTIALLY_PAID
PAID
VOID
UNCOLLECTIBLE
```

These should not be arbitrary string mutations from the UI.

---

# 73. Domain Events

The first version does not need full event sourcing.

However, internally useful domain events include:

```text
LeadCreated
LeadStageChanged
LeadConverted

MembershipCreated
MembershipActivated
MembershipFrozen
MembershipUnfrozen
MembershipRenewed
MembershipCancelled
MembershipExpired
MembershipPlanChanged

InvoiceCreated
InvoiceFinalized
InvoicePaid
InvoicePartiallyPaid
InvoiceVoided

PaymentRecorded
PaymentAllocated
PaymentRefunded
CreditIssued
CreditApplied
```

These can initially be used for:

```text
audit
notifications within the app
report refresh
future automation
```

They provide an upgrade path without requiring a distributed event architecture.

---

