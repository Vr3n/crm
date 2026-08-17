# 01 — Sales: People, Leads, Activities, Follow-ups & Stages

**Ties to:** Module 01.
**Depends on:** 00, 03 (only at conversion time, for plan/offer selection).
**Feeds into:** 02 (a converted lead becomes a customer), 09 (funnel, dashboards).

Buildable and demoable before any money moves. The first vertical slice ("Create Lead")
is the architecture proof per guidelines §28 Phase 4.

## People anchor (ADR-0009)

A `people` table anchors identity so Person ≠ Lead ≠ Customer is structural:

```text
people
  id integer PK, organization_id FK,
  full_name text NOT NULL, phone text, email text,
  date_of_birth text, gender text NULL, address text, notes text,
  created_at / updated_at
```

- A person may become a lead, then a customer — never duplicated because the lifecycle
  changed (Module 01 §Person).
- `leads.customer_id` and `customers.person_id` reference `people` (via the person),
  preserving the Module 13 model: `Person → Lead` and `Person → Customer`.

## Tables (`src/main/db/schema/sales.ts`)

```text
lead_sources      id, organization_id, name, sort_order, active         -- seeded: Walk-in, Phone,
                                                                        -- Referral, Instagram, Website,
                                                                        -- Advertisement, Existing Member Referral, Other
lead_stages       id, organization_id, name, sort_order, is_won, is_lost, active
                  -- seeded: NEW CONTACTED INTERESTED VISIT_SCHEDULED VISITED TRIAL
                  --         NEGOTIATION WON LOST   (ADR-0007; logic only reads is_won/is_lost)
lead_lost_reasons id, organization_id, name, sort_order, active          -- seeded: Too Expensive, Joined
                  -- Competitor, Not Interested, No Response, Moved Away, Medical Reason,
                  -- Wrong Contact, Other
leads
  id, organization_id FK, person_id FK,
  source_id FK lead_sources,
  current_stage_id FK lead_stages,
  owner_user_id FK users NULL,            -- sales ownership (Module 01 §27)
  customer_id FK customers NULL,          -- set on conversion; WON invariant
  status text NOT NULL DEFAULT 'OPEN',    -- OPEN / WON / LOST (mirrors current_stage flags; derived cache)
  lost_reason_id FK NULL, lost_at text, lost_by FK users NULL,
  converted_at text, converted_by FK users NULL,
  created_at, updated_at
lead_activities
  id, organization_id, lead_id FK,
  type text NOT NULL,                     -- PHONE_CALL / WALK_IN / WHATSAPP / GYM_TOUR / TRIAL /
                                          -- NOTE / PRICE_DISCUSSION / MEMBERSHIP_PROPOSAL (configurable, not enum-locked)
  note text, occurred_at text NOT NULL,
  created_by FK users NOT NULL            -- "who did this" is mandatory (Module 15)
lead_followups
  id, organization_id, lead_id FK,
  title text, due_at text NOT NULL,
  completed_at text NULL, completed_by FK users NULL,
  created_by FK users NOT NULL
lead_stage_history
  id, organization_id, lead_id FK,
  from_stage_id FK NULL, to_stage_id FK NOT NULL,
  activity_id FK NULL, changed_by FK users NOT NULL, changed_at text NOT NULL
```

## Core invariant

> **Every stage change is caused by a recorded activity, never the reverse.**
> (Module 01 §worked example, §24.)

`MoveLeadStage` requires an accompanying `lead_activity_id` (or an explicit reason for
the change). A Kanban drag without an activity is rejected by the command layer, not by
the UI.

## Commands

```text
CreateLead          lead.create            -- creates person + lead; stage NEW
AssignLead          lead.assign            -- sets owner_user_id (+ activity + audit)
RecordLeadActivity  lead.record_activity   -- creates activity; optional stage change
ScheduleFollowUp    followup.create
CompleteFollowUp    followup.complete
MoveLeadStage       lead.update_stage      -- requires activity_id; records stage history;
                                           -- WON/LOST are terminal via MarkLeadWon/MarkLeadLost
MarkLeadWon         lead.convert           -- transition path into the sale (Module 07)
MarkLeadLost        lead.mark_lost         -- sets lost_reason_id, lost_at, lost_by
ConvertLead         lead.convert           -- orchestrates the atomic sale transaction (Module 07)
```

CRUD-only when configuration: `CreateLeadSource`, `UpdateLeadSource`,
`CreateLeadStage`, `UpdateLeadStage` (never reorder past terminal stages),
`CreateLostReason`.

## Queries

```text
GetLeadDetails        lead.view            -- lead + person + stage + owner
GetLeadTimeline       lead.view            -- merged activities + stage history + follow-ups
                                             (Module 01 §24 timeline)
GetTodaysFollowups    followup.view        -- due_at = today, completed_at IS NULL
GetOverdueFollowups   followup.view        -- due_at < today, completed_at IS NULL
GetUncontactedLeads   lead.view            -- NEW with zero activities
GetFunnelCounts       report.view          -- per-stage counts (Module 09)
GetRecentlyWon / GetRecentlyLost
SearchPeople          (Module 09)          -- name/phone/email → person → leads/customer
```

## State machine

Lead is the "light" state machine: logic cares only about `is_won` / `is_lost` flags on
the stage row, not the literal stage name (ADR-0007). Any configured stage is reachable
forward or back; `WON` and `LOST` are terminal (no transition out). The transition
validity rules are: stage change requires an activity, and no transition from a terminal
stage. Implemented with the generic transition helper from 00 (see `06-backbone.md`) so
the list of stages stays data-driven.

## Tests

- CreateLead → person + lead created in one transaction; `NEW` stage; audit written.
- Stage change without an activity is rejected (`INVALID_STATE_TRANSITION`).
- MarkLeadLost requires a reason; lost_at/lost_by recorded; timeline shows it.
- WON is unreachable except through the conversion path; no transition out of WON/LOST.
- Follow-up completion requires the follow-up to exist and be uncompleted (idempotency).
- Funnel query counts match per-stage history.
- Transaction atomicity: a failure midway through "create lead + activity + follow-up"
  leaves nothing partially committed.
