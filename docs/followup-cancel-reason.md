# Follow-up Cancel Reason

**Date:** 2026-09-01
**Type:** Feature Enhancement

## Summary

Added a confirmation dialog when cancelling a follow-up, with an optional reason textarea.
Previously, clicking the cancel button would immediately cancel the follow-up without any
confirmation or reason capture.

## Changes

### Database
- Added `cancelled_reason` column (text, nullable) to `lead_followups` table
- Migration: `20260901120000_followup_cancel_reason`

### Backend
- Domain type `LeadFollowup`: added `cancelledReason: string | null`
- Repository `cancel()`: accepts optional `reason` parameter, stores in `cancelled_reason`
- IPC contract: `cancelFollowUpInputSchema` now includes `reason: z.string().max(500).optional()`
- Application layer: passes `input.reason` to repository

### Renderer
- Types `FollowUp` and `FollowUpRow`: added `cancelledReason?: string`
- `buildFollowUpRows()`: maps `cancelledReason` from lead follow-ups

### UI
- New component: `CancelFollowUpDialog` — full dialog with optional reason textarea
- `CancelFollowUpButton` (follow-up-table.tsx): opens dialog instead of direct cancel
- `FollowUpPanel` (follow-up-panel.tsx): same — opens dialog for cancel action
- `StatusBadge`: fixed cancelled variant from `success` (green) to `destructive` (red)

## Dialog Design

```
┌─────────────────────────────────────────┐
│ ✕  Cancel follow-up                     │
│                                         │
│ Cancel "Call to confirm trial" for      │
│ Rahul Sharma. Optionally add a reason   │
│ (visible in the timeline).              │
│                                         │
│ Reason                                  │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ Why is this follow-up being cancelled?  │
│                                         │
│        [Keep follow-up] [Cancel follow- │
│                          up]            │
└─────────────────────────────────────────┘
```

- Uses `Dialog` + TanStack Form (consistent with other dialogs)
- Lead name auto-selected in description (not editable)
- Optional reason textarea
- Submit button uses `variant="destructive"` styling
- Success state with loading/success feedback

## Files Modified

| File | Change |
|------|--------|
| `src/main/db/schema/sales.ts` | Added `cancelled_reason` column |
| `src/main/db/migrations/.../migration.sql` | New migration |
| `src/main/domain/lead.ts` | Added `cancelledReason` to interface |
| `src/main/repositories/sales.ts` | Updated `cancel()` + `mapFollowup()` |
| `src/shared/contracts/sales.ts` | Updated Zod schema |
| `src/main/application/leads.ts` | Pass reason to repository |
| `src/renderer/src/features/leads/types.ts` | Added `cancelledReason` |
| `src/renderer/src/features/followups/types.ts` | Added `cancelledReason` |
| `src/renderer/src/features/followups/build.ts` | Map `cancelledReason` |
| `src/renderer/src/features/followups/components/cancel-follow-up-dialog.tsx` | New dialog |
| `src/renderer/src/features/followups/components/follow-up-table.tsx` | Wire dialog + fix badge |
| `src/renderer/src/features/leads/components/detail/follow-up-panel.tsx` | Wire dialog |
