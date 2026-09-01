import { ArrowRightLeft, Info, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, initials } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import { PaymentMethodBadge } from './payment-method-badge'
import type { Refund } from '../types'

function KeyValue({
  label,
  value,
  destructive
}: {
  label: string
  value: React.ReactNode
  destructive?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium', destructive && 'text-destructive')}>{value}</span>
    </div>
  )
}

/**
 * Refund record drawer (Module 05 §17). Money that left the business, always a
 * separate dated + reasoned event layered on top of the source payment — the
 * original payment is never edited.
 */
export function RefundDetailSheet({
  refund,
  open,
  onOpenChange
}: {
  refund: Refund | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const currency = useCurrency()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {refund ? (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-destructive/10 font-mono text-sm font-semibold text-destructive">
                  {initials(refund.customer.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="font-mono text-lg tabular-nums">
                      {refund.refundNo}
                    </SheetTitle>
                    <Badge variant="destructive" className="shrink-0">
                      Issued
                    </Badge>
                  </div>
                  <p className="truncate text-sm font-medium">{refund.customer.name}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Amount returned</span>
                <span className="font-mono text-2xl font-semibold text-destructive tabular-nums">
                  −{formatMinor(refund.amountMinor, currency)}
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-7 divide-y divide-border/60">
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ArrowRightLeft className="size-4" />
                    </span>
                    <h3 className="font-heading text-sm font-medium">Details</h3>
                  </div>
                  <div>
                    <KeyValue label="Date" value={formatDate(refund.refundDate)} />
                    <KeyValue
                      label="Method"
                      value={<PaymentMethodBadge method={refund.method} />}
                    />
                    <KeyValue
                      label="Against payment"
                      value={<span className="font-mono text-xs">{refund.sourcePaymentNo}</span>}
                    />
                    <KeyValue label="Recorded by" value={refund.createdBy} />
                  </div>
                </section>

                <section className="flex flex-col gap-3 pt-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <Undo2 className="size-4" />
                    </span>
                    <h3 className="font-heading text-sm font-medium">Reason</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{refund.reason}</p>
                </section>

                <section className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 pt-5">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    The original payment stays on record unchanged — this refund is layered on top
                    as its own dated, reasoned event for auditing.
                  </p>
                </section>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
