# Timeline Integration — Implementation Details

## Overview

A universal, reusable `Timeline` component that renders any ordered sequence of
events chronologically. The component is **presentational** — it receives
`TimelineEntry[]` and renders them. It has no domain knowledge and no data
fetching. Callers map their domain data into the generic entry shape.

## Architecture

```
Timeline (presentational)
  ↑ receives entries from
Feature Timeline Sections (domain adapters)
  ↑ map domain data to entries using
Feature Queries / Types
```

### The Universal Timeline Component

**File:** `src/renderer/src/components/timeline.tsx`

A generic, domain-agnostic timeline list. Key properties:

- **Presentational only** — no data fetching, no domain logic
- **Flexible entry shape** — `id`, `label`, `date` are required; `icon`, `iconTone`, `badge`, `meta`, `description`, `isCurrent` are optional
- **First entry = current** by default (overridable via `highlightCurrent` prop)
- **Semantic HTML** — `<ol>` with `<li>` elements, `aria-label="Timeline"`
- **No Card wrapper** — renders only the list; callers compose with `Card`/`CardContent` as needed
- **Custom date formatter** — accepts optional `formatDate` prop

### TimelineEntry Shape

```typescript
interface TimelineEntry {
  id: string | number           // React key + semantics
  label: string                 // Primary text
  date: string                  // ISO timestamp
  description?: string          // Longer explanation
  icon?: LucideIcon             // Icon in the marker chip
  iconTone?: string             // Tailwind classes for icon chip
  badge?: { label: string; variant?: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }
  meta?: string                 // Extra metadata line
  isCurrent?: boolean           // Override "current" state
}
```

### Design Principles

1. **Universal** — works for any domain: activities, follow-ups, price changes,
   membership periods, invoices, payments, or any future entity.
2. **Flexible** — a minimal entry is just `{ id, label, date }`. All other
   fields are optional enhancements.
3. **Composable** — Timeline renders the list only. Callers wrap in Card, add
   headers, loading states, error states, etc.
4. **Accessible** — semantic list markup, ARIA labels, keyboard navigable.

## Feature-Specific Timeline Sections

Each feature creates a thin adapter that maps domain data to `TimelineEntry[]`:

| Section | File | Maps From | Maps To |
|---------|------|-----------|---------|
| `Timeline` (activities) | `features/leads/components/detail/timeline.tsx` | `LeadActivity[]` | entries with activity icons/tones |
| `FollowUpTimeline` | `features/leads/components/detail/follow-up-timeline.tsx` | `FollowUp[]` | entries with status badges |
| `PlanPriceTimeline` | `features/catalog/components/plan-price-timeline.tsx` | `PlanVersion[]` | entries with price meta |
| `OfferPriceTimeline` | `features/catalog/components/offer-price-timeline.tsx` | `OfferVersion[]` | entries with discount meta |
| `MembershipTimeline` | `features/customers/components/detail/membership-timeline.tsx` | `Membership[]` | entries with status badges |
| `InvoiceTimeline` | `features/invoices/components/invoice-timeline.tsx` | `Invoice[]` | entries with amount meta |

Each section follows the same pattern:

1. **Map function** — converts domain array to `TimelineEntry[]`
2. **Component** — wraps `Timeline` in a `Card` with header and loading/error states
3. **Data source** — uses existing TanStack Query hooks or prop-passed data

## Integration Points

### LeadDetailPage

**File:** `features/leads/pages/LeadDetailPage.tsx`

Uses `Tabs` (line variant) to organize timeline sections:

- **Activity tab** — all lead activities (refactored to use generic Timeline)
- **Follow-ups tab** — follow-up history with status badges
- **Plan history tab** — price changes for the lead's interested plan (conditionally shown)

The `FollowUpPanel` (interactive with complete/cancel actions) remains as a
separate card in the bento grid — it's an operational view, not a history view.

### CustomerDetailPage

**File:** `features/customers/pages/CustomerDetailPage.tsx`

Replaces the `MembershipHistory` list with `MembershipTimeline` which renders
membership periods as timeline entries using the generic Timeline component.

## Shared Utilities

### Date Formatting

**File:** `src/renderer/src/lib/format.ts`

Extracted from `features/leads/format.ts` (which now re-exports for backward
compatibility). Shared across all features.

- `formatDate(iso)` — "21 Aug 2026"
- `formatDateTime(iso)` — "21 Aug, 10:30 AM"
- `timeAgo(iso)` — "2h ago", "3d ago"
- `dueLabel(iso)` — relative label with overdue flag

## Adding a New Timeline

To add a timeline for a new domain entity:

1. **Create the timeline section** in `features/<domain>/components/`:

```tsx
import { Timeline, type TimelineEntry } from '@/components/timeline'

function mapToEntries(data: YourDomain[]): TimelineEntry[] {
  return data.map((item) => ({
    id: item.id,
    label: item.name,
    date: item.createdAt,
    description: item.description,
    icon: YourIcon,
    badge: { label: item.status, variant: 'secondary' }
  }))
}

export function YourTimeline({ data }: { data: YourDomain[] }) {
  const entries = mapToEntries(data)
  return <Timeline entries={entries} />
}
```

2. **Compose in a page** with Card wrapper:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Your history</CardTitle>
  </CardHeader>
  <CardContent>
    <YourTimeline data={data} />
  </CardContent>
</Card>
```

3. **Add loading/error states** if fetching data:

```tsx
if (isLoading) return <Skeleton />
if (isError) return <Alert variant="destructive">...</Alert>
```

## Tests

**File:** `tests/renderer/timeline.test.tsx`

10 unit tests covering:
- Renders all entries
- Empty entries produce no list
- First entry marked as current by default
- `highlightCurrent={false}` disables current marking
- Badges render when provided
- Description renders when provided
- Meta renders when provided
- Custom className applied
- Connector rails render between entries (not after last)
- Semantic `<ol>` and `<li>` elements
