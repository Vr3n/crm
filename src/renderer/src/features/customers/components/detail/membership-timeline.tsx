import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline, type TimelineEntry } from '@/components/timeline'
import { formatDate } from '@/lib/format'
import type { Membership } from '../../types'
import { effectiveStatus } from '../../build'

/**
 * Maps Membership[] into generic TimelineEntry[] for the universal
 * Timeline component. Each membership period becomes a timeline entry.
 */
function mapMembershipsToEntries(memberships: Membership[], now: number): TimelineEntry[] {
  return [...memberships]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((m) => {
      const status = effectiveStatus(m, now)
      return {
        id: m.id,
        label: m.plan,
        date: m.startDate,
        description: `${m.billingFrequency.toLowerCase()} billing · ends ${formatDate(m.endDate)}`,
        icon: History,
        iconTone:
          status === 'ACTIVE'
            ? 'bg-success/15 text-success'
            : status === 'FROZEN'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
        badge: {
          label: status,
          variant:
            status === 'ACTIVE'
              ? ('success' as const)
              : status === 'CANCELLED' || status === 'TERMINATED'
                ? ('destructive' as const)
                : ('secondary' as const)
        },
        meta:
          m.freezes.length > 0
            ? `${m.freezes.length} freeze${m.freezes.length === 1 ? '' : 's'}`
            : undefined
      }
    })
}

/**
 * Membership history as a timeline — every entitlement period rendered
 * chronologically using the universal Timeline component. This is a
 * placeholder that becomes fully functional when Module 02 (Customer &
 * Membership) database tables are implemented.
 */
export function MembershipTimeline({
  memberships,
  now
}: {
  memberships: Membership[]
  now: number
}): React.JSX.Element {
  const entries = mapMembershipsToEntries(memberships, now)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Membership history
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} period{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No membership purchased yet — this customer is on record without a plan.
          </p>
        ) : (
          <Timeline entries={entries} formatDate={formatDate} />
        )}
      </CardContent>
    </Card>
  )
}
