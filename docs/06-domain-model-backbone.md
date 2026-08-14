# Module 06 — Domain Model Backbone (Audit, Aggregates, Services, Commands/Queries)

**Bounded context:** cross-cutting — this module is the "wiring" that the other modules plug into.
**Depends on:** conceptually depends on Modules 01–05 existing as concepts, but should be designed *before* writing their database schemas, since it defines the rules those schemas must obey.
**Feeds into:** everything. This is the contract between "business rule" and "code."

## Why this module exists separately from the business modules

Modules 01–05 describe *what* the gym's business concepts are. This module describes *how the codebase is organized to enforce them reliably* — which operations are allowed to touch which tables together, what counts as one atomic unit of work, and how the system remembers who did what. Skipping this module is the #1 reason CRM-style apps rot into "any screen can update any table" spaghetti within a year.

## Worked example: why "Aggregate Boundaries" matters in practice

```text
Bad design (no aggregate boundary):
  The "Renew Membership" screen directly does:
    UPDATE memberships SET end_date = ... WHERE id = ...
    INSERT INTO invoices (...)
    UPDATE customers SET last_renewal_date = ...
  ...and the "Freeze Membership" screen does something slightly different
  to the same membership table, with its own copy-pasted validation.

  Six months later: two screens disagree on what counts as a valid
  membership end-date change. A membership ends up with an end_date
  in the past while status = ACTIVE, and nobody can explain how.

Good design (aggregate boundary respected):
  Only a MembershipService (domain layer) is allowed to change a
  Membership's state. Both "Renew" and "Freeze" screens call into
  that same service's renew() / freeze() methods. The service is the
  only code that knows the valid state transitions and enforces them
  every time, from every screen, forever.
```

This is the practical payoff of aggregate boundaries: **one place owns the rules for one entity, and every UI action goes through it.** It doesn't require heavy frameworks — in this Electron app it's simply: "don't write raw SQL from a React handler; call an application-service function that calls a domain function that then calls the repository."

## Technical decision, explained intuitively

**Why separate "Commands" from "Queries"?**
A Command changes something ("record this payment," "freeze this membership") and should always go through validation and produce an audit trail. A Query only reads something ("show me today's collections") and never needs that overhead. If the codebase doesn't distinguish them, developers will eventually "optimize" a command into a raw query for speed, silently skipping validation — this is exactly how invoices get created without a matching customer record. Naming the two categories explicitly (even just as two folders, `commands/` and `queries/`) makes the distinction visible in code review.

**Why keep an Audit History separate from each entity's own history (e.g., Lead Activities, Freeze records)?**
Domain history (a Freeze record, a Lead Activity) answers *business* questions ("why is this membership extended?"). Audit history answers *system* questions ("who changed this row, from what value, to what value, when, from which screen?") — useful for troubleshooting and accountability, but not something a gym manager needs to see day-to-day. Conflating them means either the audit log is cluttered with business noise, or the business history is missing the low-level detail a developer needs when debugging a support ticket. Two separate, narrow logs, each answering one kind of question well.

---

# 37. Audit History

Important business operations should generate audit information.

Examples:

```text
Created lead
Changed lead stage
Assigned lead
Converted lead
Created membership
Froze membership
Unfroze membership
Changed plan
Cancelled membership
Finalized invoice
Recorded payment
Refunded payment
Voided invoice
Changed offer
Changed plan price
```

The audit record should answer:

```text
What happened?
When?
Who performed it?
Which entity changed?
What was the previous value?
What is the new value?
```

A generic audit table can support this without turning every domain object into an event-sourcing system.

---

# 38. Audit vs Domain History

These should remain conceptually separate.

A domain record:

```text
MembershipFreeze
```

represents a real business fact.

An audit event:

```text
User changed membership freeze duration from 30 to 60 days.
```

represents who changed system state.

Do not use the audit table as the primary business model.

---

# 39. Aggregate Boundaries

Recommended initial aggregates:

```text
Lead
Customer
Membership
MembershipPlan
Offer
Invoice
Payment
```

Potential aggregate relationships:

```text
Lead
 ├── Activities
 ├── Follow-ups
 └── Stage history

Membership
 ├── Freeze history
 └── Membership events

Invoice
 └── Invoice lines

Payment
 └── Payment allocations
```

The exact repository boundaries should follow these aggregate rules rather than simply following database tables.

---

# 40. Domain Services

Some operations do not naturally belong to one entity.

Examples:

```text
LeadConversionService
MembershipPricingService
MembershipRenewalService
InvoiceCalculationService
PaymentAllocationService
MembershipFreezeService
```

For example:

```text
Renew Membership
```

may need to interact with:

```text
Customer
Membership
Plan
Offer
Invoice
Payment
```

That is a good candidate for an application/domain service.

---

# 41. Commands

The application layer should expose business operations rather than arbitrary CRUD wherever a business invariant exists.

Examples:

```text
CreateLead
AssignLead
RecordLeadActivity
ScheduleFollowUp
MoveLeadStage
MarkLeadLost
ConvertLead

CreateMembershipPlan
DeactivateMembershipPlan
CreateOffer
DeactivateOffer

CreateMembership
FreezeMembership
UnfreezeMembership
RenewMembership
ChangeMembershipPlan
RequestCancellation
CancelMembership

CreateInvoice
FinalizeInvoice
RecordPayment
AllocatePayment
IssueRefund
ApplyCredit
VoidInvoice
```

This is preferable to exposing generic calls such as:

```text
updateMembership(...)
updateInvoice(...)
updateLead(...)
```

for everything.

CRUD is appropriate for simple configuration screens.

Business operations require domain commands.

---

# 42. Queries

Queries should be read-oriented and can use optimized SQL/read models.

Examples:

```text
GetLeadDetails
GetLeadTimeline
GetToday'sFollowUps
GetOverdueLeads

GetCustomerProfile
GetCustomerMemberships
GetCustomerFinancialSummary

GetActiveMemberships
GetExpiringMemberships
GetFrozenMemberships

GetOutstandingInvoices
GetDailyCollections
GetRevenueByPlan
GetRevenueByPaymentMethod
GetRevenueBySalesperson
```

The read model does not have to mirror the write-side aggregate structure.

---

# 43. Core Database Entities

Initial schema should roughly contain:

```text
users

customers

leads
lead_activities
lead_followups
lead_stage_history

membership_plans
membership_plan_versions

offers
offer_redemptions

memberships
membership_freezes
membership_events

invoices
invoice_lines

payments
payment_allocations
refunds
credits
credit_allocations

audit_log

settings
```

Do not implement every future concept immediately.

This is the conceptual model, not a demand to create every table on day one.

---

# 44. Important Relationships

```text
Customer 1 ─────── N Lead

Customer 1 ─────── N Membership

Membership N ───── 1 MembershipPlan

Membership 1 ───── N MembershipFreeze

Membership 1 ───── N MembershipEvent

Lead 1 ─────────── N LeadActivity

Lead 1 ─────────── N LeadFollowup

Invoice 1 ──────── N InvoiceLine

Customer 1 ─────── N Invoice

Payment 1 ──────── N PaymentAllocation

Invoice 1 ──────── N PaymentAllocation

Payment 1 ──────── N Refund
```

---

# 45. Transaction Boundaries

Financial and membership-changing commands should be atomic.

Example:

```text
ConvertLeadToMember
```

must not result in:

```text
Customer created
Membership created
Invoice failed
```

with a half-completed operation.

Instead:

```text
BEGIN
    create customer
    create membership
    create invoice
    create lead conversion record
COMMIT
```

or:

```text
ROLLBACK
```

SQLite transactions provide this atomicity. Explicit write transactions should be used for multi-step business commands.

---

