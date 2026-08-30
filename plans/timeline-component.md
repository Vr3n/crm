# Timeline Integration Guide

This guide explains how to integrate the reusable `Timeline` component with TanStack Query and how to build the component from scratch.

## 1. Install dependencies

```shellscript
npm add @tanstack/react-query lucide-react
```

Install the required shadcn components:

```shellscript
npm dlx shadcn@latest add badge alert button skeleton
```

The component also uses the existing `cn()` utility from:

```typescript
@/lib/utils
```

---

## 2. Define the timeline data model

Create:

```typescript
// lib/timeline.ts

export type TimelineEntry = {
  id: string
  price: number
  currency: string
  effectiveAt: string
  reason: string
  description?: string
}

export type TimelineResponse = {
  productName: string
  sku: string
  entries: TimelineEntry[]
}
```

The API should return entries ordered newest first. The first entry is automatically treated as the current entry.

Example response:

```json
{
  "productName": "Workspace Pro",
  "sku": "WSP-PRO-MONTHLY",
  "entries": [
    {
      "id": "current",
      "price": 49,
      "currency": "USD",
      "effectiveAt": "2026-08-01",
      "reason": "Current price",
      "description": "Updated to reflect expanded automation and reporting features."
    },
    {
      "id": "spring-2026",
      "price": 39,
      "currency": "USD",
      "effectiveAt": "2026-04-15",
      "reason": "Feature expansion",
      "description": "Added custom roles and advanced exports."
    }
  ]
}
```

---

## 3. Create the data-fetching function

```typescript
// lib/timeline.ts

export async function fetchTimeline(productId: string): Promise<TimelineResponse> {
  if (!productId) {
    throw new Error('A product id is required.')
  }

  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/timeline`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error('Unable to load timeline.')
  }

  return response.json()
}
```

For a production application, keep this function separate from the UI. This makes it easy to replace a demo response with a REST endpoint, GraphQL query, or server action.

---

## 4. Create the TanStack Query hook

```typescript
// hooks/use-timeline.ts

import { useQuery } from '@tanstack/react-query'
import { fetchTimeline } from '@/lib/timeline'

export function useTimeline(productId: string) {
  return useQuery({
    queryKey: ['timeline', productId],
    queryFn: () => fetchTimeline(productId),
    enabled: Boolean(productId),
    staleTime: 60_000
  })
}
```

The `productId` belongs in the query key so each product receives an independent cache entry.

For example:

```typescript
;['timeline', 'workspace-pro'][('timeline', 'team-plan')]
```

---

## 5. Add the Query Client provider

Create a client provider:

```typescriptreact
// components/providers/query-provider.tsx

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false
          }
        }
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Wrap the application in the root layout:

```typescriptreact
// app/layout.tsx

import { QueryProvider } from '@/components/providers/query-provider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

The provider must be a client component because TanStack Query manages client-side cache and state.

---

# 6. Build the reusable Timeline component

Create:

```typescriptreact
// components/timeline.tsx

'use client'

import { CalendarDays, Check, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TimelineEntry } from '@/lib/timeline'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

type TimelineProps = {
  entries: TimelineEntry[]
  className?: string
}

export function Timeline({ entries, className }: TimelineProps) {
  return (
    <ol aria-label="Timeline" className={cn('relative flex flex-col', className)}>
      {entries.map((entry, index) => {
        const isCurrent = index === 0
        const isLast = index === entries.length - 1

        return (
          <li
            key={entry.id}
            className={cn(
              'relative grid grid-cols-[1.5rem_1fr] gap-4 sm:grid-cols-[2rem_1fr] sm:gap-5',
              !isLast && 'pb-9'
            )}
          >
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[0.7rem] top-6 h-[calc(100%-1.25rem)] w-px bg-border sm:left-[0.95rem]"
              />
            )}

            <span
              className={cn(
                'relative z-10 mt-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground ring-1 ring-border sm:size-6',
                isCurrent && 'bg-primary text-primary-foreground ring-primary/20'
              )}
            >
              {isCurrent ? (
                <Check aria-hidden="true" className="size-3" />
              ) : (
                <Circle aria-hidden="true" className="size-2 fill-current" />
              )}
            </span>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium tracking-tight">
                      {isCurrent ? 'Current' : 'Previous'}
                    </h3>

                    {isCurrent && (
                      <Badge variant="secondary" className="rounded-full px-2 py-0 text-[11px]">
                        Active
                      </Badge>
                    )}
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {dateFormatter.format(new Date(entry.effectiveAt))}
                  </p>
                </div>

                <p className="font-mono text-xl font-medium tracking-tight sm:text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: entry.currency,
                    maximumFractionDigits: 0
                  }).format(entry.price)}

                  <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-sm text-foreground/90">{entry.reason}</p>

                {entry.description && (
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </p>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
```

## Component design principles

The component stays reusable because:

- It receives data through `entries`.
- It does not fetch data itself.
- It does not know which product is being displayed.
- It treats the first sorted entry as current.
- It supports optional descriptions.
- It accepts an optional `className`.
- It uses semantic `<ol>` and `<li>` elements.
- It has no dependency on a specific page layout.
- It works inside a full page, dialog, drawer, or card.

The component should not call `useTimeline()` directly. Data fetching should remain in the page or feature container.

---

# 7. Create the feature container

```typescriptreact
// components/timeline-section.tsx

'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTimeline } from '@/hooks/use-timeline'
import { Timeline } from '@/components/timeline'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function TimelineSkeleton() {
  return (
    <div className="flex max-w-2xl flex-col gap-8 pl-9">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      ))}
    </div>
  )
}

export function TimelineSection({ productId }: { productId: string }) {
  const query = useTimeline(productId)

  if (query.isLoading) {
    return <TimelineSkeleton />
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Unable to load timeline</AlertTitle>

        <AlertDescription className="flex flex-wrap items-center gap-3">
          {query.error.message}

          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw data-icon="inline-start" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!query.data?.entries.length) {
    return (
      <Alert>
        <AlertTitle>No updates yet</AlertTitle>
        <AlertDescription>This product does not have any recorded history.</AlertDescription>
      </Alert>
    )
  }

  return <Timeline entries={query.data.entries} />
}
```

This separation is recommended:

```plaintext
Page
 └── TimelineSection
      ├── useTimeline()
      ├── loading state
      ├── error state
      ├── empty state
      └── Timeline
```

The `Timeline` component remains presentational, while `TimelineSection` handles TanStack Query state.

---

# 8. Full-page worked example

```typescriptreact
// app/products/[productId]/timeline/page.tsx

import { TimelineSection } from '@/components/timeline-section'

export default async function ProductTimelinePage({
  params
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-16 sm:px-10 sm:py-24">
        <header className="flex flex-col gap-3 border-b pb-10">
          <p className="text-sm text-muted-foreground">Product history</p>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Timeline</h1>

          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            A clear record of each change and the reason behind it.
          </p>
        </header>

        <section aria-labelledby="timeline-heading" className="flex flex-col gap-8 py-12 sm:py-16">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="timeline-heading" className="text-lg font-medium tracking-tight">
                Price history
              </h2>

              <p className="text-sm text-muted-foreground">Newest first</p>
            </div>
          </div>

          <TimelineSection productId={productId} />
        </section>
      </div>
    </main>
  )
}
```

This layout gives the timeline room to breathe:

- `max-w-3xl` prevents excessive line length.
- `px-6` provides safe mobile spacing.
- `py-16 sm:py-24` creates generous page whitespace.
- The timeline itself remains narrow and readable.
- No unnecessary cards or decorative containers compete with the content.

---

# 9. Dialog usage

The same component can be used in a dialog without changing the implementation:

```typescriptreact
'use client'

import { Timeline } from '@/components/timeline'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TimelineEntry } from '@/lib/timeline'

export function TimelineDialog({
  open,
  onOpenChange,
  entries
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: TimelineEntry[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Price history</DialogTitle>
        </DialogHeader>

        <Timeline entries={entries} className="py-3" />
      </DialogContent>
    </Dialog>
  )
}
```

For a dialog, keep the component itself unchanged. Adjust only the surrounding container:

```typescriptreact
<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
  <Timeline entries={entries} />
</DialogContent>
```

---

# 10. API route example

For a Next.js App Router API route:

```typescript
// app/api/products/[productId]/timeline/route.ts

import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  {
    params
  }: {
    params: Promise<{ productId: string }>
  }
) {
  const { productId } = await params

  // Replace with a database query.
  const entries = [
    {
      id: 'current',
      price: 49,
      currency: 'USD',
      effectiveAt: '2026-08-01',
      reason: 'Current price',
      description: 'Updated pricing for the current feature set.'
    }
  ]

  return NextResponse.json({
    productName: productId,
    sku: 'WSP-PRO-MONTHLY',
    entries
  })
}
```

In a real application, sort at the database/API layer:

```sql
ORDER BY effective_at DESC
```

This ensures the first item is always the current price.

---

# 11. Important implementation details

## Keep the query key stable

Use:

```typescript
queryKey: ['timeline', productId]
```

Avoid:

```typescript
queryKey: ['timeline']
```

Otherwise, multiple products could incorrectly share cached data.

## Do not fetch inside `useEffect`

Use TanStack Query directly:

```typescriptreact
const query = useTimeline(productId)
```

Do not create a manual `useEffect` that fetches and stores the result in component state.

## Validate the API response

For production, validate the response using a schema library such as Zod:

```typescript
import { z } from 'zod'

const timelineEntrySchema = z.object({
  id: z.string(),
  price: z.number(),
  currency: z.string(),
  effectiveAt: z.string(),
  reason: z.string(),
  description: z.string().optional()
})

const timelineResponseSchema = z.object({
  productName: z.string(),
  sku: z.string(),
  entries: z.array(timelineEntrySchema)
})
```

Then:

```typescript
const json = await response.json()
return timelineResponseSchema.parse(json)
```

## Handle currency dynamically

The timeline should use:

```typescript
currency: entry.currency
```

rather than hardcoding `USD`.

## Keep entries sorted

The expected order is:

```plaintext
Current
Previous
Previous
Previous
```

If the API cannot guarantee ordering, sort before rendering:

```typescript
const sortedEntries = [...entries].sort(
  (a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime()
)
```

## Make the timeline visually quiet

Use:

- One primary accent for the current marker.
- Semantic `muted`, `border`, and `foreground` tokens.
- Small metadata text.
- Generous vertical spacing.
- A narrow content column.
- No large decorative cards around every item.
- No unnecessary animations or gradients.

This lets the timeline work equally well in a full page and a compact dialog.
