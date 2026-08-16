import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/context/session-context'
import { filterLeads, sortLeads } from '../constants'
import { useLeads } from '../queries'
import type { Lead, LeadFilters, StageKey } from '../types'
import { LeadFilters as Filters } from '../components/lead-filters'
import { LeadMetrics } from '../components/lead-metrics'
import { LeadTable } from '../components/lead-table'
import { LeadBoard } from '../components/lead-board'
import { NewLeadDialog } from '../components/new-lead-dialog'
import { MoveStageDialog } from '../components/move-stage-dialog'
import { MarkLostDialog } from '../components/mark-lost-dialog'
import { ConvertDialog } from '../components/convert-dialog'
import { LogActivityDialog } from '../components/log-activity-dialog'
import { FollowUpDialog } from '../components/follow-up-dialog'

type Action =
  | { type: 'move'; lead: Lead }
  | { type: 'lost'; lead: Lead }
  | { type: 'convert'; lead: Lead }
  | { type: 'activity'; lead: Lead }
  | { type: 'followup'; lead: Lead }
  | null

const DEFAULT_FILTERS: LeadFilters = {
  search: '',
  stage: 'ALL',
  source: 'ALL',
  ownerId: 'ALL',
  range: 'all'
}

export function LeadsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const session = useSession()
  const { data, isLoading } = useLeads()
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS)
  const [view, setView] = useState<'table' | 'board'>('table')
  const [newOpen, setNewOpen] = useState(false)
  const [action, setAction] = useState<Action>(null)

  const filtered = useMemo(() => (data ? sortLeads(filterLeads(data, filters)) : []), [data, filters])

  function openLead(lead: Lead): void {
    navigate(`/leads/${lead.id}`)
  }

  /** Strict routing: WON/LOST go to their reason-requiring dialogs. */
  function onStageChange(lead: Lead, to: StageKey): void {
    if (to === 'WON') setAction({ type: 'convert', lead })
    else if (to === 'LOST') setAction({ type: 'lost', lead })
    else setAction({ type: 'move', lead })
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">
      <PageHeader
        title="Leads"
        description={`${session.organizationName} · sales pipeline`}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus />
            New lead
          </Button>
        }
      />

      <Filters filters={filters} onChange={setFilters} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {filtered.length} lead{filtered.length === 1 ? '' : 's'}
          </span>
          {filters.range !== 'all' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Sample data</span>
          )}
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as 'table' | 'board')}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <LeadMetrics leads={filtered} />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No leads match"
          description="Try widening the filters, or add a new lead to get started."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus />
              New lead
            </Button>
          }
        />
      ) : view === 'table' ? (
        <LeadTable leads={filtered} onOpen={openLead} onStageChange={onStageChange} />
      ) : (
        <LeadBoard leads={filtered} onOpen={openLead} onStageChange={onStageChange} />
      )}

      {newOpen && <NewLeadDialog open onOpenChange={setNewOpen} />}

      {action?.type === 'move' && (
        <MoveStageDialog
          key={action.lead.id}
          open
          onOpenChange={() => setAction(null)}
          lead={action.lead}
        />
      )}
      {action?.type === 'lost' && (
        <MarkLostDialog
          key={action.lead.id}
          open
          onOpenChange={() => setAction(null)}
          lead={action.lead}
        />
      )}
      {action?.type === 'convert' && (
        <ConvertDialog
          key={action.lead.id}
          open
          onOpenChange={() => setAction(null)}
          lead={action.lead}
        />
      )}
      {action?.type === 'activity' && (
        <LogActivityDialog
          key={action.lead.id}
          open
          onOpenChange={() => setAction(null)}
          lead={action.lead}
        />
      )}
      {action?.type === 'followup' && (
        <FollowUpDialog
          key={action.lead.id}
          open
          onOpenChange={() => setAction(null)}
          lead={action.lead}
        />
      )}
    </div>
  )
}