import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
import { filterPlansByStatus } from '../constants'
import { useDeletePlan, usePlans } from '../queries'
import type { Plan } from '../types'
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog'
import { PlanFilters, type PlanFiltersState } from '../components/plan-filters'
import { PlanFormDialog } from '../components/plan-form-dialog'
import { PlanMetrics } from '../components/plan-metrics'
import { PlanTable } from '../components/plan-table'

const DEFAULT_FILTERS: PlanFiltersState = { search: '', status: 'ALL' }

type DialogState = { mode: 'new' } | { mode: 'edit'; plan: Plan } | null

/**
 * Plans (Module 03 · Catalog) — the current pricing catalog. Plans change freely
 * because a Membership snapshots the price at sale time, so editing here never
 * touches existing memberships.
 */
export function PlansPage(): React.JSX.Element {
  const session = useSession()
  const { data: plans = [], isLoading } = usePlans()
  const [filters, setFilters] = useState<PlanFiltersState>(DEFAULT_FILTERS)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleting, setDeleting] = useState<Plan | null>(null)
  const deletePlan = useDeletePlan()

  const rows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase()
    return filterPlansByStatus(plans, filters.status).filter(
      (plan) =>
        needle.length === 0 ||
        plan.name.toLowerCase().includes(needle) ||
        plan.description.toLowerCase().includes(needle)
    )
  }, [plans, filters])

  const editingPlan = dialog?.mode === 'edit' ? dialog.plan : null

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Plans"
        description={`${session.organizationName} · catalog pricing`}
        actions={
          <Button onClick={() => setDialog({ mode: 'new' })}>
            <Plus className="size-4" />
            New plan
          </Button>
        }
      />

      <PlanMetrics plans={rows} />

      <PlanFilters filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {rows.length} plan{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <PlanTable
        plans={rows}
        isLoading={isLoading}
        onEdit={(plan) => setDialog({ mode: 'edit', plan })}
        onDelete={setDeleting}
      />

      <PlanFormDialog
        key={dialog ? (dialog.mode === 'edit' ? String(dialog.plan.id) : 'new') : 'closed'}
        plan={editingPlan}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete plan?'}
        description="Deleting a plan also detaches it from any offers that targeted it. Existing memberships keep their snapshot price."
        isPending={deletePlan.isPending}
        onConfirm={() => {
          if (deleting) {
            deletePlan.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}