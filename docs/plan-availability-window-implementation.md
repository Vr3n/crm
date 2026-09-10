# Plan Availability Window (Issue #107)

**Date:** 2026-09-03
**Status:** Implemented

## Overview

Added `available_from` and `available_to` date columns to `membership_plans` so plans have a sale-time availability window. Plans are excluded from the sales form when outside their window. Existing memberships are unaffected (prices already snapshotted at sale time).

## Business Rules

- Plans have an **availability window** (`available_from` / `available_to`)
- Default `available_from` = today when creating a plan
- `available_to = NULL` means open-ended (available until manually deactivated)
- Sales form filters plans by availability: `active=true AND (available_from <= today) AND (available_to IS NULL OR available_to >= today)`
- **Existing memberships are unaffected** — prices snapshotted at sale time
- Deactivating a plan (`active = false`) is separate from availability expiry

## Schema Changes

### `membership_plans` table

```sql
ALTER TABLE membership_plans ADD COLUMN available_from TEXT;
ALTER TABLE membership_plans ADD COLUMN available_to TEXT;
```

- `available_from`: ISO date (yyyy-mm-dd) when the plan becomes available for sale. Default = today.
- `available_to`: ISO date; NULL = open-ended (available until manually deactivated).

Backfill: `UPDATE membership_plans SET available_from = date(created_at) WHERE available_from IS NULL;`

## Implementation Details

### Layer Changes

| Layer | File | Changes |
|-------|------|---------|
| Schema | `src/main/db/schema/catalog.ts` | Added `available_from`, `available_to` columns |
| Domain | `src/main/domain/catalog.ts` | Added `availableFrom`, `availableTo` to `MembershipPlan` interface |
| Repository | `src/main/repositories/catalog.ts` | Added `listAvailableForSale()` query, updated row type + map + create/update |
| Shared | `src/shared/contracts/catalog.ts` | Added fields to Zod schemas (`planRowSchema`, `createPlanInputSchema`) |
| Application | `src/main/application/catalog.ts` | Added `getAvailablePlans()`, defaulted `availableFrom` to today in `createPlan` |
| IPC | `src/main/ipc/catalog.ts` | Registered `CATALOG_LIST_AVAILABLE_PLANS` handler |
| Preload | `src/preload/index.ts` | Exposed `catalog.listAvailablePlans()` method |
| Renderer API | `features/catalog/api/plans.api.ts` | Added `listAvailablePlans()` method |
| Renderer Queries | `features/catalog/queries.ts` | Added `useAvailablePlans()` hook |
| Renderer Types | `features/catalog/types.ts` | Added `availableFrom`, `availableTo` to `Plan` and `PlanInput` |
| Renderer Mappers | `features/catalog/mappers.ts` | Updated `mapPlanRow()` and `mapPlanInput()` |
| Plan Form | `features/catalog/components/plan-form-dialog.tsx` | Added date inputs inline with Sellable toggle |
| Status Badge | `features/catalog/components/catalog-status-badge.tsx` | Added `getPlanAvailability()` and updated `PlanStatusBadge` |
| Plan Table | `features/catalog/components/plan-table.tsx` | Added availability date column + availability-aware status badge |
| Plan Picker | `features/memberships/sale/components/plan-picker.tsx` | Switched to `useAvailablePlans()` for server-filtered list |
| Plan Filters | `features/catalog/components/plan-filters.tsx` | Extended filter options to All/Available/Upcoming/Expired/Inactive |
| Plan Metrics | `features/catalog/components/plan-metrics.tsx` | Added availability breakdown counts |
| Constants | `features/catalog/constants.ts` | Added `filterPlansByAvailability()` helper and `PlanAvailabilityFilter` type |

### IPC Channel

```typescript
CATALOG_LIST_AVAILABLE_PLANS: 'catalog:listAvailablePlans'
```

### Repository Query

```typescript
planRepo.listAvailableForSale(organizationId, today)
// Filters: active=true AND (available_from <= today) AND (available_to IS NULL OR available_to >= today)
```

### Frontend Status Logic

```typescript
function getPlanAvailability(plan: Plan): PlanAvailability {
  if (!plan.isActive) return 'INACTIVE'
  const today = new Date().toISOString().slice(0, 10)
  if (plan.availableFrom && plan.availableFrom > today) return 'UPCOMING'
  if (plan.availableTo && plan.availableTo < today) return 'EXPIRED'
  return 'ACTIVE'
}
```

## Tests

Added 5 tests in `tests/main/application/catalog.test.ts`:

1. Excludes plans with `available_to` in the past
2. Excludes plans with `available_from` in the future
3. Includes plans with `available_to = NULL` (open-ended)
4. Defaults `available_from` to today when creating a plan
5. Changing plan availability doesn't affect existing memberships

## No Impact on Existing Memberships

- Prices snapshotted at sale time
- Existing memberships continue regardless of plan availability changes
- A plan expiring from availability doesn't affect active memberships
