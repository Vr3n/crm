import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { timeAgo } from '@/features/leads/format'
import { useLeads } from '@/features/leads/queries'
import type { Lead } from '@/features/leads/types'
import { COLD_LEAD_DAYS, MAX_ROWS } from '../constants'
import { daysSince } from '../format'

const HEAD = 'px-0 py-2 text-left text-xs font-medium text-muted-foreground'
const CELL = 'px-0 py-2 align-middle'

/** Last moment the lead had any follow-up or activity; createdAt if never touched. */
function lastTouchedAt(lead: Lead): string {
  const stamps = lead.activities
    .map((a) => a.at)
    .concat(
      lead.followUps.flatMap((f) => [f.dueAt, f.completedAt].filter((v): v is string => Boolean(v)))
    )
  return stamps.length ? stamps.reduce((m, s) => (s > m ? s : m)) : lead.createdAt
}

/**
 * Leads turning cold — non-terminal leads with no follow-up or activity for a
 * while (Module 09 §58). Longest silence first so the most at-risk leads
 * surface at the top. Lost (and won) leads are excluded.
 */
export function LeadsGoingColdTable(): React.JSX.Element {
  const { data, isLoading } = useLeads()
  const rows = useMemo(() => {
    if (!data) return []
    return data
      .filter((l) => l.stage !== 'LOST' && l.stage !== 'WON')
      .map((l) => ({ lead: l, since: daysSince(lastTouchedAt(l)) }))
      .filter(({ since }) => since >= COLD_LEAD_DAYS)
      .sort((a, b) => b.since - a.since)
      .slice(0, MAX_ROWS)
  }, [data])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flame className="size-4 text-warning" />
          Leads turning cold
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="Nothing going cold"
            description={`Leads with no follow-up or activity for ${COLD_LEAD_DAYS}+ days will appear here.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-transparent">
                <TableHead className={HEAD}>Lead</TableHead>
                <TableHead className={HEAD}>Contact</TableHead>
                <TableHead className={`${HEAD} text-right`}>Last follow-up / activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ lead, since }) => (
                <TableRow key={lead.id}>
                  <TableCell className={CELL}>
                    <div className="flex flex-col">
                      <span className="font-medium">{lead.name}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {since}d silent
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={`${CELL} text-muted-foreground`}>
                    {lead.phone?.trim() || lead.email?.trim() || '—'}
                  </TableCell>
                  <TableCell className={`${CELL} text-right text-muted-foreground`}>
                    {timeAgo(lastTouchedAt(lead))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
