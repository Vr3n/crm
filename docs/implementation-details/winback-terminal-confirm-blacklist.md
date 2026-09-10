# Implementation Details — Win-Back, Terminal Confirm, Blacklist Refund-Only

Three related sales-safety changes, all driven by one domain idea: a lost lead
is not a dead lead (the salesperson can win them back), but terminal and
blacklisted records need explicit friction before staff act on them.

## 1. Win-back: LOST is re-openable, WON stays absorbing

**Domain** (`src/main/domain/lead.ts` — `LeadStageMachine.assertMoveAllowed`):
moves *from* a LOST stage are allowed; moves from WON still throw
`InvalidStateTransitionError`; WON/LOST targets, inactive stages, and the
activity requirement are unchanged.

**Application** (`src/main/application/leads.ts`): all four move paths
(`moveLeadStage`, `bulkMoveLeadStage`, `completeFollowUp` + stageChange,
`bulkCompleteFollowUps` + stageChange) clear `lost_at`/`lost_reason_id` via the
new `leadRepo.clearLostState()` when moving out of LOST — inside the same
transaction. Only current-state columns reset: every `lead_stage_history` row
(including the original LOST entry with its reason, actor, and timestamp) stays,
so analysis can query "lost then re-opened, by whom, through which activity".

**Renderer**: the Change Status? select shows for every stage except WON —
`CompleteFollowUpDialog`, `BulkCompleteFollowUpDialog` (intersection includes
LOST rows; a WON row hides the move since the batch could never apply), the
Pipeline inline stage select (disabled only for WON), and the detail
"Move stage" quick action (shown for LOST, hidden for WON; "Mark as lost"
stays hidden for both). The schedule/activity dialogs never gated on terminal
and needed no change. The Dashboard Upcoming card's Lead cell renders a
`StageBadge` under the name (`NameCell subtext` slot), so pipeline context —
e.g. a LOST lead with a pending follow-up — is visible without opening the lead.

## 2. Terminal confirm: soft gate on scheduling (UI-only)

`src/renderer/src/components/confirm-dialog.tsx` — a generic controlled
`AlertDialog` (title, description, confirm/cancel labels, pending state).
Wired into five submit paths via a `confirmedRef` re-submit pattern (dialogs
remount per open, so no stale confirmation survives):

- `FollowUpDialog` / `LogActivityDialog` (single + picker mode — checks the
  resolved target lead),
- `BulkFollowUpDialog` / `BulkActivityDialog` (`terminalCount` prop computed in
  `LeadsPage` from the selection),
- `EditFollowUpDialog` (extend; uses `followUp.stage` directly).

No backend change: the backend still refuses scheduling for
`suppressFollowups` stages (DND / Not Interested) with a clear error, and the
confirm copy says so implicitly by succeeding only where allowed.

## 3. Blacklist refund-only rule (backend-enforced)

`assertPersonAllowed(orgId, personId, action)` /
`assertCustomerAllowed(orgId, customerId, action)` in
`src/main/application/blacklist.ts` throw `BlacklistedPersonError`
(`"Cannot {action}: person … is blacklisted (refunds only)"`, code
`VALIDATION_ERROR`). Wired into every mutating use case: all of `leads.ts`
(create/edit/assign/move/bulk-move/delete/record/bulk-record/schedule/
bulk-schedule/complete/bulk-complete/extend/cancel/mark-lost), memberships
sell/**renew** (previously unguarded)/cancel/revert, finance
record/allocate/record-and-allocate/**issue-credit/apply-credit**, and all
invoice mutations. The bulk-complete guard sits before the transaction so a
blacklisted lead aborts the batch even with no stage change. Untouched: reads
everywhere, `issueRefund` + `processScheduledRefunds`, blacklist management
itself, catalog/identity/photo/export. Out of scope by decision: person-photo
updates (cosmetic, no business effect).

**Renderer** (UX only; backend is the enforcer): `excludeBlacklisted` on the
schedule/activity pickers, disabled queue + dashboard follow-up row buttons
with a "Blacklisted — refunds only" tooltip (aria-labels unchanged), and
broadened blacklist-dialog copy.

## Tests

- `tests/domain/lead-stage-machine.test.ts`: LOST→open allowed (incl. to
  suppress stages), WON→* still rejected.
- `tests/main/application/leads.test.ts`: LOST re-open via single/bulk move
  and complete-with-change (markers cleared, history kept: LOST entry + re-open
  entry); WON move still throws; bulk rollback fixture moved from LOST to WON.
- `tests/main/application/blacklist.test.ts` (+13): helper unit + blocked
  create/schedule/record/move/complete/bulk-move/bulk-schedule/renew/payment/
  invoice + refund-still-allowed.
- `tests/renderer/terminal-confirm.test.tsx` (7): ConfirmDialog unit +
  single schedule/log/extend confirm-then-submit for LOST, straight-through
  for NEW, bulk confirm through `LeadsPage`.
- `tests/renderer/lead-picker.test.tsx`: exclusion on/off.
- `tests/renderer/name-cell.test.tsx`: name + stage subtext + blacklist marker.
- `tests/e2e/winback-blacklist.spec.ts`: LOST dashboard badge → Change
  Status? → re-open flips Pipeline badge to Contacted; terminal schedule
  confirm in-app; blacklist cancels pendings, keeps views, excludes from
  picker, refuses new work with a refunds-only toast.

## Verification (this pass)

- Full suite: **847/849** — only the 2 pre-existing time-dependent
  `membership-cancel-renew` failures (date arithmetic, unrelated).
- `typecheck:web` clean; eslint 0 errors on touched files (repo-wide CRLF
  prettier noise untouched).
- E2E: 7/7 incl. the 2 new specs (against a fresh `electron-vite build`).
- Drive-by fix: `createInvoice` temp numbers gained a random suffix — two
  back-to-back creates in the same millisecond collided on the UNIQUE number
  (proven flaky 1-fail-in-3 before the fix, 3/3 green after).
