import { Suspense, lazy, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardHeader } from '../components/dashboard-header'
import { DashboardActions } from '../components/dashboard-actions'
import { UpcomingFollowupsTable } from '../components/upcoming-followups-table'
import { RecentLeadsTable } from '../components/recent-leads-table'
import { MembershipExpirationsTable } from '../components/membership-expirations-table'
import { PaymentsDueTable } from '../components/payments-due-table'
import { LeadsGoingColdTable } from '../components/leads-going-cold-table'
import { FollowUpsTimelineCard } from '../components/follow-ups-timeline-card'
import { NewLeadDialog } from '@/features/leads/components/new-lead-dialog'
import { FollowUpDialog } from '@/features/leads/components/follow-up-dialog'
import { LogActivityDialog } from '@/features/leads/components/log-activity-dialog'
import { CompleteFollowUpDialog } from '@/features/followups/components/complete-follow-up-dialog'
import { useLeads } from '@/features/leads/queries'
import { findLeadForMember } from '../lead-match'
import type { PaymentDue } from '../types'
import type { PersonRef } from '../types'
import type { FollowUpRow } from '@/features/followups/types'

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
  const [paymentTarget, setPaymentTarget] = useState<PaymentDue | null>(null)
  const [followUpTarget, setFollowUpTarget] = useState<PersonRef | null>(null)
  const [completeTarget, setCompleteTarget] = useState<FollowUpRow | null>(null)

  const { data: leads } = useLeads()
  const matchedLead = useMemo(
    () => (followUpTarget ? findLeadForMember(followUpTarget, leads ?? []) : undefined),
    [followUpTarget, leads]
  )

  return (
    <main className="flex w-full flex-col gap-6 px-6 py-8">
      <DashboardHeader />

      <DashboardActions
        onNewLead={() => setNewLeadOpen(true)}
        onScheduleFollowUp={() => setFollowUpOpen(true)}
        onScheduleActivity={() => setActivityOpen(true)}
        onNewMembership={() => navigate('/memberships/sale')}
      />

      <section aria-label="Upcoming work" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingFollowupsTable onComplete={(row) => setCompleteTarget(row)} />
        <RecentLeadsTable />
      </section>

      <section aria-label="Member data" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MembershipExpirationsTable onFollowUp={(row) => setFollowUpTarget(row.member)} />
        <PaymentsDueTable
          onMakePayment={(row) => setPaymentTarget(row)}
          onFollowUp={(row) => setFollowUpTarget(row.member)}
        />
      </section>

      <section aria-label="Risk & follow-ups" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LeadsGoingColdTable />
        <FollowUpsTimelineCard />
      </section>

      {newLeadOpen && <NewLeadDialog open onOpenChange={setNewLeadOpen} />}
      {followUpOpen && <FollowUpDialog open onOpenChange={setFollowUpOpen} />}
      {followUpTarget && (
        <FollowUpDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setFollowUpTarget(null)
              setFollowUpOpen(false)
            }
          }}
          lead={matchedLead}
        />
      )}
      {activityOpen && <LogActivityDialog open onOpenChange={setActivityOpen} />}
      {completeTarget && (
        <CompleteFollowUpDialog
          open
          onOpenChange={(open) => {
            if (!open) setCompleteTarget(null)
          }}
          followUp={completeTarget}
        />
      )}
      {paymentTarget ? (
        <Suspense fallback={null}>
          <RecordPaymentDialog
            open={!!paymentTarget}
            onOpenChange={(open) => {
              if (!open) setPaymentTarget(null)
            }}
            preSelectedCustomer={paymentTarget.member}
            preSelectedInvoiceId={paymentTarget.id}
          />
        </Suspense>
      ) : null}
    </main>
  )
}
