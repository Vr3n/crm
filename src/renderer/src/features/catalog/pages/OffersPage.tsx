import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
import { filterOffersByLifecycle } from '../pricing'
import { useDeleteOffer, useOffers, usePlans } from '../queries'
import type { Offer } from '../types'
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog'
import { OfferFilters, type OfferFiltersState } from '../components/offer-filters'
import { OfferFormDialog } from '../components/offer-form-dialog'
import { OfferMetrics } from '../components/offer-metrics'
import { OfferTable } from '../components/offer-table'

const DEFAULT_FILTERS: OfferFiltersState = { search: '', lifecycle: 'ALL' }

type DialogState = { mode: 'new' } | { mode: 'edit'; offer: Offer } | null

/**
 * Offers (Module 03 · Catalog) — pricing rules layered on plans. The discount
 * math is snapshotted onto the Membership/Invoice at sale time, so historical
 * invoices keep their own price even when an offer changes.
 */
export function OffersPage(): React.JSX.Element {
  const session = useSession()
  const { data: offers = [], isLoading } = useOffers()
  const { data: plans = [] } = usePlans()
  const [filters, setFilters] = useState<OfferFiltersState>(DEFAULT_FILTERS)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deleting, setDeleting] = useState<Offer | null>(null)
  const deleteOffer = useDeleteOffer()

  const rows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase()
    return filterOffersByLifecycle(offers, filters.lifecycle).filter(
      (offer) =>
        needle.length === 0 ||
        offer.name.toLowerCase().includes(needle) ||
        offer.code.toLowerCase().includes(needle)
    )
  }, [offers, filters])

  const editingOffer = dialog?.mode === 'edit' ? dialog.offer : null

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Offers"
        description={`${session.organizationName} · pricing rules at sale time`}
        actions={
          <Button onClick={() => setDialog({ mode: 'new' })}>
            <Plus className="size-4" />
            New offer
          </Button>
        }
      />

      <OfferMetrics offers={rows} />

      <OfferFilters filters={filters} onChange={setFilters} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {rows.length} offer{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <OfferTable
        offers={rows}
        plans={plans}
        isLoading={isLoading}
        onEdit={(offer) => setDialog({ mode: 'edit', offer })}
        onDelete={setDeleting}
      />

      <OfferFormDialog
        key={dialog ? (dialog.mode === 'edit' ? String(dialog.offer.id) : 'new') : 'closed'}
        offer={editingOffer}
        plans={plans}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete offer?'}
        description="Invoices that already used this offer keep their snapshot price. Only future sales are affected."
        isPending={deleteOffer.isPending}
        onConfirm={() => {
          if (deleting) {
            deleteOffer.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}