# Implementation Details — Mark Follow-up Done with Optional Stage Change

The `CompleteFollowUpDialog` ("Mark follow-up done") now offers an optional **Change Status?**
pipeline move, mirrored from the Record Activity form (`LogActivityDialog`), and the Follow-ups
queue's bulk "Mark all as done" toolbar carries the same optional move. Completing a follow-up and
moving the lead happen in a **single atomic transaction** on the backend — the renderer never
chains two IPC calls.

## Contract

`completeFollowUpInputSchema` (`src/shared/contracts/sales.ts`) gained an optional `stageChange`
object:

```ts
stageChange: z.object({
  targetStageId: z.number().int().positive(),
  expectedStageId: z.number().int().positive()
}).optional()
```

- `targetStageId` — the stage the renderer wants to move the lead to.
- `expectedStageId` — the stage the renderer *believes* the lead is on (optimistic-concurrency
  token, same pattern as `moveLeadStageInputSchema`, decision **D17**).

Return type stays `void` (the follow-ups list invalidates and refetches).

## Backend (`completeFollowUp` in `src/main/application/leads.ts`)

- Permission checks run up-front for both operations: `FOLLOWUP_COMPLETE` always, plus
  `LEAD_UPDATE_STAGE` when `stageChange` is present — so a Front Desk user who can complete
  follow-ups but not move stages gets a `ForbiddenError` without any partial write.
- The idempotency short-circuit (`if (followup.completedAt) return`) still runs **before** the
  move, so a repeated completion never applies a stale second move.
- The strict stage machine (`stageMachineFor(...).assertMoveAllowed(current, target, true)`) is
  enforced inside the transaction — moving FROM/to a terminal stage is rejected
  (`InvalidStateTransitionError`).
- Everything runs in one `withTransaction`: complete the follow-up, create the activity,
  update the lead stage, record the `stage_history` row, and (when moving to a
  `suppressFollowups` stage) cancel the lead's other pending follow-ups with the
  `SUPPRESS_FOLLOWUP_REASONS` message.
- **Auto-NOTE rule**: "every stage change is caused by a recorded activity". If the user requested
  a stage change but did not log an activity, the backend auto-creates a NOTE activity and links it
  to the `stage_history` row. The note text is **context-aware**: with user-supplied completion
  notes it embeds those; otherwise it is a short fallback that mentions the move —
  `Followup completed — moved to {Stage Name}`. The renderer sends no activity for the auto-NOTE
  path — it is purely a backend fallback, keeping the contract small.
- Concurrency: if `lead.currentStageId !== expectedStageId`, the whole transaction aborts with a
  `ConflictError` ("Lead changed concurrently; refresh and retry") — nothing is written.

## Renderer (`complete-follow-up-dialog.tsx`)

- A "Change Status?" `Select` renders **below** the "Log an activity" collapsible section.
- Visible only for **non-terminal** stages (`!isTerminal(followUp.stage)` and
  `moveableStages(followUp.stage).length > 0`). `moveableStages` alone is not enough: for a
  WON/LOST lead it would still return all other non-terminal stages, and the backend would reject
  the move — so terminal leads hide the field entirely.
- Options are `moveableStages(followUp.stage)` rendered as `StageBadge` pills; placeholder is
  "No change".
- `targetStage` defaults to `''`. On submit, `stageChange` is built only when a stage was picked
  and it differs from the follow-up's current stage; both stage keys resolve to ids via
  `stageIdOf(maps, ...)` from `useReferenceData()`. Otherwise `stageChange` is `undefined` and the
  request is exactly what it was before this change (backwards-compatible).

## Bulk "mark all as done" with optional stage change

The Follow-ups queue's selection toolbar ("Mark all as done") completes every selected follow-up in
a **single atomic call** — `bulkCompleteFollowUps` (`src/main/application/leads.ts`), exposed on
channel `leads:bulkCompleteFollowups`.

### Why one atomic backend op (not N renderer calls)?

- **One IPC crossing instead of N+1.** Each `ipcRenderer.invoke` is a bridge + serialize hop whose
  cost scales with the number of tracked messages; a single invocation for the whole selection is
  cheaper than per-follow-up round trips by construction.
- **One SQLite transaction instead of N per-follow-up commits.** Per-row commits are the dominant
  cost (each commit forces a `fync` even in WAL mode — roughly two orders of magnitude slower than
  a single multi-row transaction), and a single transaction is **all-or-nothing**: if any lead
  cannot move, nothing is written. This mirrors the existing `bulkMoveLeadStage` philosophy.

### Contract

`bulkCompleteFollowUpsInputSchema` = `{ followUpIds: number[] (1..100), stageChange?:
{ targetStageId } }`; result = `{ completed: number }` (count of open follow-ups actually
completed; already-completed ones are skipped silently, matching the single-flow idempotency).

- No `expectedStageId`: one token can't represent N leads' current stages. The backend validates
  each lead's **live** stage inside the transaction via the strict stage machine instead.

### Backend behaviour (`bulkCompleteFollowUps`)

- Same up-front RBAC as the single flow: `FOLLOWUP_COMPLETE` always, `LEAD_UPDATE_STAGE` when
  `stageChange` is present.
- All moves are validated before any write (all-or-nothing): a terminal/missing lead or a foreign
  `targetStageId` aborts the whole batch (`InvalidStateTransitionError` / `NotFoundError`), and the
  transaction rolls back — every follow-up stays open.
- Moved leads are deduped per lead; each gets an auto-NOTE activity (no notes are captured in bulk)
  + a `stage_history` row. Moving to a `suppressFollowups` stage cancels the lead's other pending
  follow-ups (same `SUPPRESS_FOLLOWUP_REASONS` message as the single flow).

### Renderer (`bulk-complete-follow-up-dialog.tsx`)

- Header shows the selection count; optional **Change Status?** select, hidden when the intersection
  is empty or any selected lead is terminal (an all-or-nothing batch could never apply).
- The move options are the **intersection** of `moveableStages` over the selection — the same rule
  the leads bulk toolbar uses — so no batch offers a stage some lead cannot reach.
- Submitting sends one `bulkCompleteFollowUps({ followUpIds, stageChange? })` call.
- Row-level "Mark done" in the queue now opens the existing `CompleteFollowUpDialog` (the icon
  previously completed inline without any move); the bulk verb opens the new dialog. The Dashboard's
  Upcoming Follow-ups card "Mark done" uses the **same** dialog, so a stage move is offered there
  too (the card filters to upcoming rows, so a completed follow-up simply leaves the card). The lead
  detail panel is unchanged.
- **Win-back rule (added later):** LOST is re-openable — the changer shows for every stage
  except WON (`LeadStageMachine.assertMoveAllowed` allows moves *from* LOST; WON stays
  absorbing). Moving out of LOST clears `lost_at`/`lost_reason_id` on the lead row while all
  `lead_stage_history` rows stay as the audit trail. The Dashboard card's Lead cell shows a
  `StageBadge` under the name so the pipeline context is visible without opening the lead.
  See `winback-terminal-confirm-blacklist.md`.

## Tests

- `tests/main/application/leads.test.ts` (backend, in the follow-ups describe block):
  - atomic completion + move with a logged activity;
  - auto-NOTE when a move is requested without an activity (`Followup completed — moved to …`);
  - `ForbiddenError` for Front Desk (has `followup.complete`, lacks `lead.update_stage`);
  - `ConflictError` on a stale `expectedStageId` with **full rollback** (follow-up stays open);
  - cancellation of other pending follow-ups when moving to a `suppressFollowups` stage
    (`DO_NOT_DISTURB`);
  - idempotency: completing an already-completed follow-up ignores the new `stageChange`;
  - **bulk**: completes open follow-ups + skips already-completed ones (result counts);
  - **bulk**: shared target moves each lead atomically with one auto-NOTE + history entry each;
  - **bulk**: Front Desk denial with a stage change;
  - **bulk**: all-or-nothing rollback when one lead cannot move (WON fixture — LOST is
    re-openable now, so the unmovable case moved up the terminal ladder);
  - **bulk**: foreign `targetStageId` → `NotFoundError` + rollback;
  - **bulk**: moves to `DO_NOT_DISTURB` cancel sibling pending follow-ups.
- `tests/renderer/complete-follow-up-dialog.test.tsx` (renderer):
  - the select is shown for a non-terminal stage with its hint text;
  - the select is shown for LOST (win-back) but hidden for WON (absorbing);
  - choosing a target submits `stageChange { targetStageId: 2, expectedStageId: 1 }`;
  - leaving it on "No change" omits `stageChange`.
- `tests/renderer/bulk-complete-follow-up-dialog.test.tsx` (renderer):
  - selection count header + Change Status? select shown;
  - select shown with a LOST lead in the selection, hidden only with a WON lead;
  - one `bulkCompleteFollowups({ followUpIds, stageChange })` call when a target is picked;
  - `stageChange: undefined` when left on "No change".
- `tests/e2e/followup-stage-change.spec.ts` (Playwright, real app):
  - row-level: creating a lead with a follow-up → queue → Mark follow-up done → Change Status? →
    the queue row flips to Done and reopening the lead shows the moved stage;
  - bulk: two leads → select all → Mark all as done → Change Status? → both rows Done and both
    leads show the moved stage.
- `tests/e2e/dashboard-followup-stage-change.spec.ts` (Playwright, real app):
  - dashboard Upcoming Follow-ups card → "Mark done" opens the shared dialog, Change Status? is
    present and completing with a move removes the follow-up from the card.

## Notes / non-goals

- `LogActivityDialog` already carried the equivalent optional move; no changes were made there.
- The move is offered at every surface that completes a follow-up with side-effects — the queue
  per-row (complete dialog), the bulk selection toolbar, and the Dashboard's Upcoming Follow-ups
  card (shared complete dialog). The lead detail panel remains completion-only.
- RBAC is enforced backend-side; the dialogs rely on the server to refuse moves the user may not
  perform.