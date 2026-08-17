import { useMemo, useState } from 'react'
import { PiggyBank, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { RefundsMetrics } from '../components/refunds-metrics'
import { RefundsTable } from '../components/refunds-table'
import { CreditsTable } from '../components/credits-table'
import { RefundDetailSheet } from '../components/refund-detail-sheet'
import { CreditDetailSheet } from '../components/credit-detail-sheet'
import { IssueRefundDialog } from '../components/issue-refund-dialog'
import { AddCreditDialog } from '../components/add-credit-dialog'
import { filterCredits, filterRefunds } from '../filters'
import { useCredits, useRefunds } from '../queries'
import type { Credit, CreditStatus, PaymentMethod, Refund } from '../types'

/**
 * Refunds & Credits (Module 05 §17–18). One workbench, two money-out flows that
 * must never blur together: refunds leave the business as separate dated events
 * layered on a payment, credits stay inside as value against a future invoice.
 */
export function RefundsPage(): React.JSX.Element {
  const { data: refunds, isLoading: loadingRefunds } = useRefunds()
  const { data: credits, isLoading: loadingCredits } = useCredits()
  const [tab, setTab] = useState('refunds')
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | 'ALL'>('ALL')
  const [creditStatus, setCreditStatus] = useState<CreditStatus | 'ALL'>('ALL')
  const [issueOpen, setIssueOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null)
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null)
  const [refundSheetOpen, setRefundSheetOpen] = useState(false)
  const [creditSheetOpen, setCreditSheetOpen] = useState(false)

  const visibleRefunds = useMemo(
    () => filterRefunds(refunds ?? [], { method: refundMethod, search: '' }),
    [refunds, refundMethod]
  )
  const visibleCredits = useMemo(
    () => filterCredits(credits ?? [], { status: creditStatus, search: '' }),
    [credits, creditStatus]
  )

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Refunds & Credits"
        description="Money that leaves — and value that stays — separate, dated, and traceable to a customer."
        actions={
          <>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <PiggyBank />
              Add credit
            </Button>
            <Button variant="destructive" onClick={() => setIssueOpen(true)}>
              <Undo2 />
              Issue refund
            </Button>
          </>
        }
      />

      <RefundsMetrics refunds={refunds ?? []} credits={credits ?? []} />

      <Tabs value={tab} onValueChange={setTab} className="flex w-full flex-col gap-2">
        <TabsList>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>

        <TabsContent value="refunds" className="mt-0">
          <RefundsTable
            refunds={visibleRefunds}
            isLoading={loadingRefunds}
            method={refundMethod}
            onMethodChange={setRefundMethod}
            onOpen={(refund) => {
              setSelectedRefund(refund)
              setRefundSheetOpen(true)
            }}
          />
        </TabsContent>

        <TabsContent value="credits" className="mt-0">
          <CreditsTable
            credits={visibleCredits}
            isLoading={loadingCredits}
            status={creditStatus}
            onStatusChange={setCreditStatus}
            onOpen={(credit) => {
              setSelectedCredit(credit)
              setCreditSheetOpen(true)
            }}
          />
        </TabsContent>
      </Tabs>

      {issueOpen && (
        <IssueRefundDialog open={issueOpen} onOpenChange={setIssueOpen} refunds={refunds ?? []} />
      )}

      {addOpen && <AddCreditDialog open={addOpen} onOpenChange={setAddOpen} />}

      <RefundDetailSheet
        refund={selectedRefund}
        open={refundSheetOpen}
        onOpenChange={setRefundSheetOpen}
      />

      <CreditDetailSheet
        credit={selectedCredit}
        open={creditSheetOpen}
        onOpenChange={setCreditSheetOpen}
      />
    </div>
  )
}
