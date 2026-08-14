# Module 12 — Scope Boundaries, Development Order, Workflows & Acceptance Criteria

**Bounded context:** project management artifact, not a code module — read this before writing a single line of the others.
**Purpose:** tells the team what *not* to build yet, in what order to build what remains, and how to know each piece is actually done.

## How to use this module

Treat the "Acceptance Criteria" scenarios at the end as the project's real definition of done — more useful than a UI mockup, because they're phrased as business-truth statements independent of any screen design. A junior developer should be able to write an automated test directly from each numbered scenario (e.g., Scenario 3, "plan price changes next month, old invoices remain unchanged," becomes a two-line integration test: create invoice, change plan price, re-fetch invoice, assert unchanged).

---

# 74. What Not to Build Yet

The initial domain should deliberately exclude:

```text
Cloud synchronization
Multi-tenant SaaS architecture
Online payment gateways
WhatsApp integration
Email integration
Marketing automation
AI lead scoring
Webhooks
External APIs
Biometric devices
Mobile applications
Complex double-entry accounting
Warehouse inventory
Multi-location franchise accounting
```

The model should remain extensible without implementing these prematurely.

---

# 75. Future Modules

The existing model should leave room for:

```text
Attendance
Class Scheduling
Personal Training
Trainer Management
Physical Inventory
POS
Purchase Orders
Supplier Management
Gift Cards
Referrals
Marketing Campaigns
Automated Retention
Multi-location
Accounting
Tax Reporting
Online Payments
```

These should be added as new bounded contexts rather than turning the existing modules into generic abstractions.

---

# 76. Most Important Domain Distinctions

Developers should memorize these distinctions.

```text
Person
    ≠ Lead
    ≠ Customer
    ≠ Membership
```

A person can become a lead.

A lead can convert into a customer.

A customer can have multiple memberships.

A membership belongs to a plan.

A plan is not a membership.

An offer changes a sale.

An offer does not change historical invoices.

An invoice represents an obligation.

A payment represents money received.

A payment is not an invoice.

A refund is not deletion of a payment.

A credit is not a refund.

A note is not a follow-up.

An activity is not a future task.

A membership freeze is not merely a boolean.

An audit record is not the business entity itself.

---

# 77. Primary Business Workflows

The application should be designed around these workflows.

## Workflow A — New Lead

```text
Create Lead
    ↓
Assign Owner
    ↓
Record Activity
    ↓
Create Follow-up
    ↓
Contact Lead
    ↓
Move Stage
```

---

## Workflow B — Lead Converts

```text
Open Lead
    ↓
Select Plan
    ↓
Select Offer
    ↓
Calculate Final Price
    ↓
Create Customer
    ↓
Create Membership
    ↓
Create Invoice
    ↓
Record Payment
    ↓
Allocate Payment
    ↓
Activate Membership
    ↓
Mark Lead WON
```

All financial/member creation must occur atomically.

---

## Workflow C — Membership Renewal

```text
Find Membership
    ↓
Review existing plan
    ↓
Select renewal plan/offer
    ↓
Calculate renewal price
    ↓
Create renewal invoice
    ↓
Record payment
    ↓
Extend/create membership period
    ↓
Record renewal event
```

---

## Workflow D — Freeze

```text
Open membership
    ↓
Request freeze
    ↓
Validate policy
    ↓
Set freeze dates
    ↓
Determine access behavior
    ↓
Determine billing behavior
    ↓
Determine extension/credit
    ↓
Create freeze record
    ↓
Record event
```

---

## Workflow E — Cancellation

```text
Request cancellation
    ↓
Determine effective date
    ↓
Record reason
    ↓
Finalize outstanding charges according to policy
    ↓
Membership becomes cancelled
    ↓
Preserve customer history
```

---

## Workflow F — Payment

```text
Select customer/invoice
    ↓
Enter payment amount
    ↓
Select payment method
    ↓
Confirm
    ↓
Create payment
    ↓
Allocate payment
    ↓
Update invoice state
    ↓
Record audit event
```

---

# 78. Acceptance Criteria for the Domain

The software foundation is correct when these scenarios work reliably.

### Scenario 1

A lead is created.

The staff member can:

```text
assign owner
record discussion
create follow-up
change stage
```

without losing history.

### Scenario 2

A lead purchases a plan.

The system creates:

```text
customer
membership
invoice
invoice lines
payment
payment allocation
conversion record
```

in one atomic operation.

### Scenario 3

The plan price changes next month.

Old memberships and invoices remain unchanged.

### Scenario 4

A customer partially pays an invoice.

The system shows:

```text
Invoice: ₹20,000
Paid:    ₹10,000
Due:     ₹10,000
Status:  PARTIALLY_PAID
```

### Scenario 5

A payment is refunded.

The original payment remains historical.

A refund record explains the reversal.

### Scenario 6

A membership is frozen.

The system records:

```text
who
when
start
end
reason
billing consequence
access consequence
extension/credit
```

rather than only changing a status.

### Scenario 7

A membership plan is deactivated.

Existing memberships continue to work.

The plan simply becomes unavailable for new sales.

### Scenario 8

An invoice is finalized.

Its financial values cannot silently change because the plan or offer later changes.

### Scenario 9

The application crashes halfway through a membership sale.

The database contains either:

```text
complete transaction
```

or:

```text
no partial transaction
```

not half of one.

### Scenario 10

The application is closed and reopened.

All business state is reconstructed entirely from the local SQLite database.

---

# 79. Recommended Development Order

The implementation order should follow business dependency rather than UI screens.

```text
1. Database foundation
2. Users / staff
3. Customer identity
4. Membership plans
5. Offers
6. Leads
7. Lead activities/follow-ups
8. Memberships
9. Invoice model
10. Payments
11. Payment allocation
12. Membership sale workflow
13. Renewal
14. Freeze
15. Cancellation
16. Refunds / credits
17. Audit log
18. Operational dashboards
19. Reporting
20. Backup / restore
21. Import/export
```

The important point is that the team should not start by building the dashboard.

The dashboard is a read model over the underlying domain.

---

