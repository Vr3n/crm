import { lazy, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardHeader } from '../components/dashboard-header'
import { DashboardActions } from '../components/dashboard-actions'
import { MembershipExpirationsTable } from '../components/membership-expirations-table'
import { PaymentsDueTable } from '../components/payments-due-table'
import { LeadsGoingColdTable } from '../components/leads-going-cold-table'
import { NewLeadDialog } from '@/features/leads/components/new-lead-dialog'
import { FollowUpDialog } from '@/features/leads/components/follow-up-dialog'
import { LogActivityDialog } from '@/features/leads/components/log-activity-dialog'

const RecordPaymentDialog = lazy(() =>
  import('@/features/finance/components/record-payment-dialog').then((m) => ({
    default: m.RecordPaymentDialog
  }))
)

/**
 * Operational dashboard (Module 09 §58). Prioritises work, not vanity stats:
 * renewals due, unpaid dues and leads going cold. Composes the member-facing
 * mock read models with live lead data, all behind the same TanStack Query /
 * mock-store pattern as the leads feature.
 */
export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)

  const handleMakePayment = (invoiceId: string) => {
    setPaymentInvoiceId(invoiceId)
    setPaymentDialogOpen(true)
  }

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8">
      <DashboardHeader />

      <DashboardActions
        onNewLead={() => setNewLeadOpen(true)}
        onScheduleFollowUp={() => setFollowUpOpen(true)}
        onScheduleActivity={() => setActivityOpen(true)}
        onNewMembership={() => navigate('/memberships/sale')}
      />

      <section aria-label="Operational data" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MembershipExpirationsTable />
        <PaymentsDueTable onMakePayment={handleMakePayment} />
      </section>

      <LeadsGoingColdTable />

      {newLeadOpen && <NewLeadDialog open onOpenChange={setNewLeadOpen} />}
      {followUpOpen && <FollowUpDialog open onOpenChange={setFollowUpOpen} />}
      {activityOpen && <LogActivityDialog open onOpenChange={setActivityOpen} />}
      {paymentDialogOpen && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          preSelectedInvoiceId={paymentInvoiceId ?? undefined}
        />
      )}
    </main>
  )
}
