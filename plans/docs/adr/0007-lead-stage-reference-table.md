# Lead Stage as reference table + code enum

Lead stages are a seeded, org-scoped reference table (`lead_stages` with `sort_order`,
`is_won`, `is_lost`, `active`) paired with a code-side enum constant for the state
machine. Application logic reads only the boolean flags, never the literal stage name
(Module 01). Chosen over a hard-coded status column because gyms configure their own
pipelines (one wants TRIAL, another doesn't offer trials); "make the rare case
configurable, not the common case" costs one lookup table and avoids a rewrite when a
gym owner changes stages. The enum constant keeps transition rules and permissions
type-safe while the table stays the source of pipeline truth. WON/LOST are terminal via
the flags; every stage change requires a recorded activity (Module 01's robustness
rule).