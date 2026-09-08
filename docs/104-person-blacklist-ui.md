# 104 — Person Blacklist UI

Implements the frontend portion of [GitHub Issue #104](https://github.com/Vr3n/gym-crm/issues/104): blacklist/unblacklist a person from the Leads and Customers surfaces, with red row styling and detail-page banners.

## Summary

The backend was implemented in commit `3c90f71` (migration v24). This change exposes `isBlacklisted` in the read models and adds the full UI:

- **Lead table**: red row tint + "Blacklisted" badge + toggle button
- **Customer table**: red row tint + "Blacklisted" badge + toggle button
- **Lead detail page**: red banner with reason + toggle button
- **Customer detail page**: red banner with reason + toggle button
- **Shared BlacklistDialog**: optional reason field, TanStack Form, lazy-loaded
- **useBlacklistToggle mutation**: invalidates both `['leads']` and `['customers']` query keys

## Files Changed

### Backend (read model exposure)

| File | Change |
|---|---|
| `src/shared/contracts/sales.ts` | Add `isBlacklisted: z.boolean()` to `leadListRowSchema` |
| `src/main/repositories/sales.ts` | Add `isBlacklisted: people.is_blacklisted` to `leadRepo.list()` select + return type |
| `src/shared/contracts/customers.ts` | Add `isBlacklisted` + `blacklistedReason` to `customerOutputSchema` |
| `src/main/ipc/customers.ts` | Add `is_blacklisted` / `blacklisted_reason` to `PersonRow`, `buildCustomerOutput` |

### Frontend (new files)

| File | Purpose |
|---|---|
| `src/renderer/src/features/people/blacklist.ts` | `useBlacklistToggle` mutation hook — calls `window.api.blacklist.toggle`, invalidates both leads + customers queries |
| `src/renderer/src/features/people/components/blacklist-dialog.tsx` | Shared TanStack Form dialog for blacklist/unblacklist. Blacklist mode shows optional reason `Textarea`; unblacklist mode is a plain confirm. Lazy-loaded. |
| `src/renderer/src/features/people/components/blacklist-banner.tsx` | Reusable banner for detail pages. Shows red warning when blacklisted (with reason) + toggle button gated by `person.blacklist` permission. |

### Frontend (modified files)

| File | Change |
|---|---|
| `src/renderer/src/features/leads/types.ts` | Add `isBlacklisted: boolean` to `Lead` |
| `src/renderer/src/features/leads/mapping.ts` | Map `row.isBlacklisted` → `isBlacklisted` |
| `src/renderer/src/features/leads/components/lead-table.tsx` | Red row tint + "Blacklisted" badge + `Ban`/`ShieldCheck` toggle button in actions column. New props: `onBlacklist`, `canBlacklist`. |
| `src/renderer/src/features/leads/pages/LeadsPage.tsx` | Lazy-load `BlacklistDialog`, manage `blacklisting` state, pass `canBlacklist` + `onBlacklist` to `LeadTable` |
| `src/renderer/src/features/leads/pages/LeadDetailPage.tsx` | Render `BlacklistBanner` between back button and grid |
| `src/renderer/src/features/customers/types.ts` | Add `isBlacklisted` + `blacklistedReason` to `Customer` |
| `src/renderer/src/features/customers/components/customer-table.tsx` | Red row tint via `getRowClassName` + "Blacklisted" badge + `Ban`/`ShieldCheck` toggle column. New props: `onBlacklist`, `canBlacklist`. |
| `src/renderer/src/features/customers/pages/CustomersPage.tsx` | Lazy-load `BlacklistDialog`, manage `blacklisting` state, pass `canBlacklist` + `onBlacklist` |
| `src/renderer/src/features/customers/pages/CustomerDetailPage.tsx` | Render `BlacklistBanner` between back button and grid |
| `src/renderer/src/features/dashboard/components/data-table.tsx` | Add `getRowClassName?: (row: TData) => string` prop, applied to each `<TableRow>` |

## Key Design Decisions

1. **Person-level, not lead/customer-level**: Blacklist is stored on `people`. Both `leads:list` and `customers:get/list` now include it via the `people` join.

2. **Dual query invalidation**: `useBlacklistToggle` invalidates both `['leads']` and `['customers']` because a person can appear in both surfaces.

3. **Permission gating**: All blacklist toggle UI is gated by `can(session.permissions, session.isSuper, 'person.blacklist')`. Front Desk has this permission by default.

4. **Lazy-loaded dialogs**: Per `docs/form-implementation-guideline.md`, the `BlacklistDialog` is `React.lazy` + `<Suspense>` and remounts fresh per open.

5. **Optional reason**: Per the existing contract (`blacklisted_reason` is nullable), the reason field is optional. The banner shows "No reason recorded" when the flag is set but no reason is present.

6. **Red row styling**: Applied via `cn()` conditional class on the row element — `bg-destructive/5` base, `bg-destructive/10` on hover, `bg-destructive/15` when selected. Works for both the manual `LeadTable` and the generic `DataTable` (via `getRowClassName`).

## LeadPicker: Blacklist Exclusion & Avatar Rows

The `LeadPicker` combobox (shared across membership sale forms, follow-up dialog, log-activity dialog) was updated:

- **New prop**: `excludeBlacklisted?: boolean` (default `false`). When true, blacklisted leads are filtered out of the dropdown.
- **Avatar + name + mobile rows**: Each dropdown item now shows `PersonAvatar` (sm), lead name, and phone via `displayPhone()`. Photos load through the batshit-batched `usePersonPhoto` hook (many rows coalesce into one IPC call within a 10ms window).
- **Selected icon**: `UserRound` replaced with `Check` for clearer selection feedback.
- **Enabled on**: `/memberships/sale` page and dashboard quick-sell `MembershipSaleDialog`. Follow-up and log-activity dialogs keep showing blacklisted leads (they may still need activity tracking).

### Files Changed

| File | Change |
|---|---|
| `src/renderer/src/features/leads/components/lead-picker.tsx` | New `excludeBlacklisted` prop; filter logic; PersonAvatar rows; `Check` icon |
| `src/renderer/src/features/memberships/sale/page.tsx` | Pass `excludeBlacklisted` to `LeadPicker` |
| `src/renderer/src/features/dashboard/components/membership-sale-dialog.tsx` | Pass `excludeBlacklisted` to `LeadPicker` |

## Memberships: Blacklist Reflection

The Memberships table (`/memberships`) now reflects person blacklist status, mirroring the Leads and Customers tables exactly:

- **Badge**: `Blacklisted` badge (`<Badge variant="destructive">`) in the Member cell's `PersonCell` subtext, alongside the membership/customer id.
- **Row tint**: Red row highlight via `getRowClassName` — `bg-destructive/5` base, `bg-destructive/10` on hover, `bg-destructive/15` when selected.
- **Toggle**: `Ban`/`ShieldCheck` action column gated by `person.blacklist` permission. The same shared `BlacklistDialog` is used, ensuring cross-surface invalidation.
- **Data flow**: `MembershipRow` carries `isBlacklisted` + `blacklistedReason` from the parent `Customer` (which in turn reads from `people.is_blacklisted`). No backend changes needed — the customers list query already includes the person's blacklist status.

### Files Changed

| File | Change |
|---|---|
| `src/renderer/src/features/memberships/types.ts` | Add `isBlacklisted: boolean` and `blacklistedReason?: string` to `MembershipRow` |
| `src/renderer/src/features/memberships/build.ts` | Propagate `isBlacklisted` and `blacklistedReason` from each customer |
| `src/renderer/src/features/memberships/components/membership-table.tsx` | Blacklisted badge in Member cell; `Ban`/`ShieldCheck` actions column; red row tint via `getRowClassName` |
| `src/renderer/src/features/memberships/pages/MembershipsPage.tsx` | Lazy-load `BlacklistDialog`, manage `blacklisting` state, pass `canBlacklist` + `onBlacklist` to table |

## Fix: Stale Customers/Leads After Blacklist Toggle

Two issues were causing the Customers and Memberships tables to never reflect the blacklisted state:

### 1. Root cause: `is_blacklisted` type mismatch (`ipc/customers.ts`)

The `people` table schema uses `integer('is_blacklisted', { mode: 'boolean' })`, which makes Drizzle return a JavaScript `boolean` (`true`/`false`). However, the `PersonRow` interface in `ipc/customers.ts` declared `is_blacklisted: number`, and the `buildCustomerOutput` function compared `person?.is_blacklisted === 1`. Since `true === 1` is `false` in JavaScript, `isBlacklisted` was **always `false`** in the customers output — no matter what the database held.

**Fix:** Changed `PersonRow.is_blacklisted` from `number` to `boolean`, and the comparison from `=== 1` to `=== true`.

### 2. Cache refresh: `refetchType: 'all'`

The `useBlacklistToggle` hook now uses `refetchType: 'all'` when invalidating queries. Previously, `invalidateQueries` defaulted to `refetchType: 'active'`, which only refreshed currently-mounted queries. This caused stale data when blacklisting from the Leads page while the Customers query was inactive.

### Files Changed

| File | Change |
|---|---|
| `src/main/ipc/customers.ts` | Fix `PersonRow.is_blacklisted` type from `number` to `boolean`; fix comparison `=== 1` → `=== true` |
| `src/renderer/src/features/people/blacklist.ts` | `refetchType: 'all'` on both `['leads']` and `['customers']` invalidation calls |

## Out of Scope

- **Membership cancellation on blacklist** — no cancel-membership command exists yet.
- **Membership renewal blocking** — no renewal command exists yet.
- **Standalone Person page** — no `PeopleDetailPage` exists; person search (`peopleListSchema`) already includes `isBlacklisted`.

## Testing

- All 707 existing tests pass.
- Typecheck clean (`tsc --noEmit`).
- ESLint clean (0 errors; prettier whitespace warnings are pre-existing).
