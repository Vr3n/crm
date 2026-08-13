# Module 01 — People, Leads & Sales Pipeline

**Bounded context:** `Sales / CRM`
**Can be built:** independently, first. It has no dependency on Billing or Membership — a Lead can exist in a database with zero invoices.
**Depends on:** nothing else in this system (it only needs Users/Staff for "owner" assignment).
**Feeds into:** Module 02 (Customer & Membership) at the moment a Lead converts.

## Why this module exists on its own

Sales activity (calls, walk-ins, follow-ups, stage changes) happens constantly and independently of money changing hands. If Lead/Sales logic is entangled with Membership or Billing code, then a simple thing like "log that I called Rahul" ends up depending on invoice tables that have nothing to do with it. Keeping this module standalone means:

- A developer can build and demo the entire sales pipeline (Kanban board, follow-up reminders, activity timeline) before a single rupee has ever been billed.
- The Sales pipeline's data model never needs to change just because billing rules change.

## Worked example: the full life of one lead, told through this module's vocabulary

```text
Day 0  — Rahul walks in.
         → Person created: Rahul Sharma
         → Lead created: "Rahul — Annual Premium enquiry", source = Walk-in, stage = NEW

Day 0  — Front-desk staff talks to him for 10 minutes.
         → Lead Activity recorded: type=Walk-in, note="Interested in annual plan, asked about pool access"
         → Lead Stage moved: NEW → CONTACTED
         → Follow-up created: "Call Rahul tomorrow 11:00 AM", due=Day 1 11:00

Day 1  — Staff calls Rahul.
         → Lead Activity recorded: type=Phone Call, note="Wants to visit gym first"
         → Follow-up (Day 1 call) marked done
         → New Follow-up created: "Confirm gym tour", due=Day 3
         → Lead Stage moved: CONTACTED → VISIT_SCHEDULED

Day 3  — Rahul tours the gym, tries a session.
         → Lead Activity recorded: type=Gym Tour
         → Lead Activity recorded: type=Trial session
         → Lead Stage moved: VISIT_SCHEDULED → VISITED → TRIAL

Day 5  — Rahul negotiates price, then agrees.
         → Lead Activity recorded: type=Price discussion
         → Lead Stage moved: TRIAL → NEGOTIATION
         → (conversion happens here — see Module 02)
         → Lead Stage moved: NEGOTIATION → WON
```

Notice: **every stage change is caused by a recorded activity, never the reverse.** The UI should never let staff silently drag a card from NEW to WON on a Kanban board without an activity/reason being attached — otherwise the sales history becomes fiction. This is the single most important robustness rule for this module.

## Technical decision, explained intuitively

**Why keep `Lead Stage` as a plain enum/lookup table instead of a rigid hard-coded status column?**
Gyms differ — one owner wants "TRIAL" as a stage, another doesn't offer trials at all. If stages are hard-coded into application logic (`if (stage === 'TRIAL')`), every gym owner who wants a different pipeline needs a code change. Instead: store stages in a small reference table (`lead_stage` with `id, name, sort_order, is_won, is_lost`) seeded with the recommended defaults below, and let the application logic only care about the *boolean flags* (`is_won`, `is_lost`), not the literal stage name. This is a classic "make the rare case configurable, not the common case" decision — it costs one extra table and saves you from a rewrite six months in.

**Why is `Note`, `Follow-up`, and `Activity` three different concepts instead of one `lead_notes` table?**
Because they answer three different questions a manager asks constantly:
- "What do I need to do next?" → Follow-up (future, has a due date, gets marked done)
- "What happened?" → Activity (past, immutable, timestamped)
- "What extra context should I remember?" → Note (informational, doesn't imply action or event)

If you collapse these into one free-text field, you can no longer build a "today's follow-ups" dashboard query — you'd have to grep text. Three narrow tables with clear meaning are cheap in SQLite and make reporting trivial (`SELECT * FROM followups WHERE due_date = today() AND completed_at IS NULL`).

---

# 3. Ubiquitous Language

Developers and gym staff must use the same terms.

## Person

A human being known to the business.

A Person is not inherently a lead or member.

A person may first appear as a lead and later become a customer/member.

The same person must not be duplicated merely because their lifecycle changed.

---

## Lead

A sales opportunity involving a person who may become a paying customer.

A Lead is not the customer itself.

Example:

```text
Person:
    Rahul Sharma

Lead:
    Rahul's enquiry for the Annual Premium plan
```

A person may have multiple opportunities over time.

For the first version, however, one active lead per person is usually sufficient unless there is a clear business requirement for multiple simultaneous opportunities.

---

## Lead Source

Where the enquiry came from.

Examples:

```text
Walk-in
Phone
Referral
Instagram
Website
Advertisement
Existing Member Referral
Other
```

The system should allow configurable sources.

Do not hard-code marketing channels into the database schema.

---

## Lead Stage

The current stage of the sales process.

Recommended initial stages:

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

The exact names can be configurable later.

A stage represents the sales state, not whether a staff member performed an action.

---

## Follow-up

A future action that someone intends to perform.

Example:

```text
Call Rahul tomorrow at 11:00 AM.
```

A note is not necessarily a follow-up.

This distinction is important:

```text
Note       = historical information
Follow-up  = future work
Activity   = something that actually happened
```

---

## Lead Activity

A record of an interaction or sales event.

Examples:

```text
Phone Call
Walk-in
WhatsApp conversation
Gym Tour
Trial session
Note
Price discussion
Membership proposal
```

The application should retain activities as history rather than overwriting a lead's history.

---

-e 

---

## Sales Ownership, Conversion & Lost-Lead Rules

*(Original spec sections 22–27 — reproduced here because they are still part of the Sales bounded context; conversion is where this module hands off to Module 02.)*

# 22. Lead Conversion

Lead conversion is a business transaction.

Typical workflow:

```text
Lead
  ↓
Interested
  ↓
Visit / Trial
  ↓
Membership selected
  ↓
Sale
  ↓
Invoice
  ↓
Payment
  ↓
Membership activated
```

Conversion should not simply perform:

```text
lead.status = "converted"
```

A successful conversion should result in explicit domain objects.

Example:

```text
Lead
    ↓
Customer
    ↓
Membership
    ↓
Invoice
    ↓
Payment
```

The system must maintain the relationship between these objects.

---

# 23. Lead Conversion Invariant

A lead marked as WON should have a corresponding business outcome.

Recommended invariant:

```text
WON lead
    must reference the resulting customer/sale
```

Likewise:

```text
Membership activated
    must have a valid customer
    and valid membership plan
```

and:

```text
Invoice finalized
    must contain at least one billable line
```

These rules belong to the domain/application layer, not only the UI.

---

# 24. Lead Discussion History

The lead detail screen should function as a timeline.

Example:

```text
13 Aug 2026 10:00
Lead created
Source: Walk-in

13 Aug 2026 11:30
Phone call
Interested in Annual Premium

13 Aug 2026 14:00
Gym tour completed

14 Aug 2026 09:00
Follow-up due

14 Aug 2026 11:00
Offer discussed

15 Aug 2026 12:00
Converted to member
```

This is more useful than storing everything inside one large `notes` field.

Recommended domain objects:

```text
Lead
LeadActivity
FollowUp
LeadStageHistory
```

---

# 25. Follow-up Rules

Every active lead should make it possible to answer:

```text
Who owns this lead?
What stage is it in?
What happened last?
What should happen next?
When should it happen?
```

Therefore a lead dashboard should expose:

```text
New Leads
Overdue Follow-ups
Today's Follow-ups
Uncontacted Leads
Trials Ending
Recently Lost
Recently Won
```

A lead with no next action should be considered operationally suspicious even if its stage is "interested."

---

# 26. Lost Lead

A lost lead should record why it was lost.

Example reasons:

```text
Too Expensive
Joined Competitor
Not Interested
No Response
Moved Away
Medical Reason
Wrong Contact
Other
```

Do not store only:

```text
lead.status = LOST
```

Use:

```text
lost_reason
lost_at
lost_by
```

This allows later analysis of sales performance.

---

# 27. Sales Ownership

A Lead should have an owner.

```text
lead.owner_user_id
```

This enables:

```text
Leads per salesperson
Conversion rate per salesperson
Overdue follow-ups per salesperson
Revenue generated per salesperson
```

The system should preserve ownership history if reassignment matters.

A simple first version can maintain:

```text
current_owner_id
```

and an audit trail can provide historical ownership later.

---

