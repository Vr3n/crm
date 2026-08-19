import { useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useLead } from '../queries'
import { computeQuality } from '../data-quality'
import { IdentityCard } from '../components/detail/identity-card'
import { NextActionCard } from '../components/detail/next-action-card'
import { StageHistory } from '../components/detail/stage-history'
import { FollowUpPanel } from '../components/detail/follow-up-panel'
import { Timeline } from '../components/detail/timeline'
import { QuickActions, type QuickActionType } from '../components/detail/quick-actions'
import { MoveStageDialog } from '../components/move-stage-dialog'
import { MarkLostDialog } from '../components/mark-lost-dialog'
import { LogActivityDialog } from '../components/log-activity-dialog'
import { FollowUpDialog } from '../components/follow-up-dialog'

/**
 * Lead detail (bento layout, Module 01 §24). Identity + actions up top, then a
 * bento of Next action / Stage history / Follow-ups, with the full Timeline as
 * the anchor of the page. Every verb routes through its strict dialog.
 */
export function LeadDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const leadId =
    id === undefined || Number.isNaN(Number(id)) ? undefined : Number(id)
  const navigate = useNavigate()
  const location = useLocation()
  const { data: lead, isLoading } = useLead(leadId)
  const [action, setAction] = useState<QuickActionType | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/leads'
  const backLabel =
    from === '/followups' ? 'Follow-ups' : from === '/activities' ? 'Activities' : 'Pipeline'

  const quality = useMemo(() => (lead ? computeQuality(lead) : null), [lead])

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-6 p-6">
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-56 xl:col-span-2" />
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40 xl:col-span-2" />
          <Skeleton className="h-40" />
          <Skeleton className="h-72 xl:col-span-2" />
        </div>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="flex w-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="Lead not found"
          description="This lead may have been removed."
          action={
            <Button onClick={() => navigate(from)}>
              <ArrowLeft />
              Back to {backLabel.toLowerCase()}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Link to={from}>
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            {backLabel}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <IdentityCard lead={lead} quality={quality!} />
        </div>
        <QuickActions lead={lead} onAction={setAction} />

        <NextActionCard lead={lead} />
        <div className="xl:col-span-2">
          <FollowUpPanel lead={lead} />
        </div>
        <StageHistory lead={lead} />
        <div className="xl:col-span-2">
          <Timeline lead={lead} />
        </div>
      </div>

      {action === 'move' && (
        <MoveStageDialog key={lead.id} open onOpenChange={() => setAction(null)} lead={lead} />
      )}
      {action === 'lost' && (
        <MarkLostDialog key={lead.id} open onOpenChange={() => setAction(null)} lead={lead} />
      )}
      {action === 'activity' && (
        <LogActivityDialog key={lead.id} open onOpenChange={() => setAction(null)} lead={lead} />
      )}
      {action === 'followup' && (
        <FollowUpDialog key={lead.id} open onOpenChange={() => setAction(null)} lead={lead} />
      )}
    </div>
  )
}
