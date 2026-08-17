# Per-plan proration policy as data

Upgrade/downgrade/cancellation proration is a per-plan policy (a `proration_policies`
lookup table referenced by `membership_plans.proration_policy_id`), not one global rule
and not hard-coded. Modules 02/04 only said "should be configurable"; REVIEW.md flagged
this as the remaining design gap because gyms differ materially in how they credit
unused days. Chosen over a single fixed rule because it mirrors the same
policy-as-data pattern already used for Freeze and Lead Stage, and keeps
`ChangeMembershipPlan`/cancellation logic stable while policy lives in the database.
Seeded defaults ship per organization on setup; plans reference their own policy.