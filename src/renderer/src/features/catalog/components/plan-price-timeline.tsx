import { Tag, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Timeline, type TimelineEntry } from '@/components/timeline'
import { usePlanVersions } from '../queries'
import { formatDate } from '../format'
import { formatMinor, formatRate, type CurrencyCode } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'

/**
 * Maps PlanVersion[] into generic TimelineEntry[] for the universal
 * Timeline component. Each version shows the price at that point in time.
 */
function mapPlanVersionsToEntries(
  versions: { id: number; basePriceMinor: number; taxRateBps: number; effectiveFrom: string }[],
  currency: CurrencyCode
): TimelineEntry[] {
  return versions.map((v, index) => ({
    id: v.id,
    label: index === 0 ? 'Current price' : 'Previous price',
    date: v.effectiveFrom,
    description: v.taxRateBps > 0 ? `Tax rate: ${formatRate(v.taxRateBps)}` : undefined,
    icon: Tag,
    iconTone: index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
    badge: index === 0 ? { label: 'Current', variant: 'secondary' as const } : undefined,
    meta: formatMinor(v.basePriceMinor, currency),
    isCurrent: index === 0
  }))
}

function TimelineSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 pl-9">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      ))}
    </div>
  )
}

/**
 * Plan price history as a timeline — shows every recorded price change for a
 * membership plan, newest first. The first entry is the current price.
 */
export function PlanPriceTimeline({
  planId,
  planName
}: {
  planId: number
  planName?: string
}): React.JSX.Element {
  const query = usePlanVersions(planId)
  const currency = useCurrency()

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="size-4 text-primary" />
            {planName ? `${planName} — price history` : 'Price history'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineSkeleton />
        </CardContent>
      </Card>
    )
  }

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="size-4 text-primary" />
            Price history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Unable to load price history</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {query.error.message}
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                <RefreshCw className="size-3" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const entries = mapPlanVersionsToEntries(query.data ?? [], currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="size-4 text-primary" />
          {planName ? `${planName} — price history` : 'Price history'}
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} change{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded price changes yet.</p>
        ) : (
          <Timeline entries={entries} formatDate={formatDate} />
        )}
      </CardContent>
    </Card>
  )
}
