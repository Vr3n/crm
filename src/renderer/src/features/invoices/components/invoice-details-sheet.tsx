import {
  CalendarClock,
  Mail,
  Phone,
  ReceiptText,
  UserRound,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, initials } from '@/features/leads/format'
import { PAYMENT_METHOD_META } from '@/lib/payment-methods'
import { formatMoney } from '@/lib/money'
import { INVOICE_STATUS_META } from '../constants'
import { useInvoice } from '../queries'
import type { Invoice } from '../types'
import { InvoiceStatusBadge } from './invoice-status-badge'

/**
 * Invoice drawer opened from a register row ("View" or row click). Shows the
 * immutable billing snapshot — lines with per-line tax (Module 04 §14), the
 * derived totals and the payments allocated against it (Module 05 §16) — so a
 * front-desk staff member can see exactly what an invoice says without leaving
 * the register.
 */

function SectionHeading({
  icon: Icon,
  title,
  hint
}: {
  icon: LucideIcon
  title: string
  hint?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="font-heading text-sm font-medium">{title}</h3>
      </div>
      {hint}
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone?: 'muted' | 'danger' | 'accent'
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          'truncate text-sm font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'accent' && 'text-primary'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function AllocationRow({ invoice }: { invoice: Invoice }): React.JSX.Element {
  if (invoice.allocations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No payments recorded against this invoice yet.
      </p>
    )
  }
  return (
    <div>
      {invoice.allocations.map((a) => {
        const meta = PAYMENT_METHOD_META[a.method]
        const Icon = meta.icon
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {a.reference} · {a.receivedBy}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold tabular-nums">{formatMoney(a.amount)}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(a.receivedAt)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InvoiceLines({ invoice }: { invoice: Invoice }): React.JSX.Element {
  return (
    <>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Tax</span>
        </div>
        {invoice.lines.map((l) => (
          <div
            key={l.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 border-t border-border/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.description}</p>
              {l.discountAmount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Discount {formatMoney(l.discountAmount)}
                </p>
              ) : null}
            </div>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {l.quantity}
            </span>
            <span className="text-right text-xs tabular-nums">{formatMoney(l.unitPrice)}</span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {l.taxRate}%
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">
          Subtotal <span className="font-mono tabular-nums">{formatMoney(invoice.subtotal)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Tax (GST) <span className="font-mono tabular-nums">{formatMoney(invoice.taxTotal)}</span>
        </span>
        <span className="text-sm font-semibold">
          Total <span className="font-mono tabular-nums">{formatMoney(invoice.total)}</span>
        </span>
      </div>
    </>
  )
}

function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function InvoiceSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-36 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

export function InvoiceDetailsSheet({
  invoice,
  open,
  onOpenChange
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  // `invoice` stays set while `open` goes false so the content persists through
  // the close (exit) animation instead of flashing empty.
  const { data, isLoading, isError } = useInvoice(invoice?.id)

  const meta = data ? INVOICE_STATUS_META[data.status] : undefined
  const hasFooterActions =
    data != null &&
    (data.status === 'OPEN' || data.status === 'PARTIALLY_PAID' || data.status === 'PAID')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {invoice && (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {initials(invoice.customer.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate text-lg">{invoice.customer.name}</SheetTitle>
                    {data ? <InvoiceStatusBadge status={data.status} /> : null}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {invoice.invoiceNo}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" />
                  {invoice.customer.phone ?? '—'}
                </span>
                {invoice.customer.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{invoice.customer.email}</span>
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {isLoading ? (
                <InvoiceSkeleton />
              ) : isError || !data ? (
                <p className="text-sm text-muted-foreground">Couldn&apos;t load this invoice.</p>
              ) : (
                <div className="flex flex-col gap-8">
                  <div className="flex gap-2.5">
                    <StatTile
                      label="Total"
                      value={formatMoney(data.total)}
                      tone={
                        data.status === 'VOID' || data.status === 'UNCOLLECTIBLE'
                          ? 'muted'
                          : 'accent'
                      }
                    />
                    <StatTile
                      label="Paid"
                      value={formatMoney(data.paidAmount)}
                      tone={data.paidAmount > 0 ? 'accent' : 'muted'}
                    />
                    <StatTile
                      label="Outstanding"
                      value={formatMoney(data.outstanding)}
                      tone={data.outstanding > 0 ? 'danger' : 'muted'}
                    />
                  </div>

                  <section className="flex flex-col gap-3">
                    <SectionHeading
                      icon={ReceiptText}
                      title="Invoice lines"
                      hint={
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {meta?.label} · {data.lines.length}{' '}
                          {data.lines.length === 1 ? 'line' : 'lines'}
                        </span>
                      }
                    />
                    <InvoiceLines invoice={data} />
                  </section>

                  <section className="flex flex-col gap-3">
                    <SectionHeading icon={Wallet} title="Payments allocated" />
                    <AllocationRow invoice={data} />
                  </section>

                  <section className="flex flex-col gap-3">
                    <SectionHeading icon={CalendarClock} title="Details" />
                    <div>
                      <KeyValue label="Issued" value={formatDate(data.issuedAt)} />
                      {data.dueAt ? <KeyValue label="Due" value={formatDate(data.dueAt)} /> : null}
                      <KeyValue label="Status" value={meta?.label ?? data.status} />
                      <KeyValue
                        label="Created by"
                        value={
                          <span className="flex items-center gap-1.5">
                            <UserRound className="size-3.5 text-muted-foreground" />
                            {data.createdBy}
                          </span>
                        }
                      />
                    </div>
                  </section>
                </div>
              )}
            </div>

            {hasFooterActions && (
              <SheetFooter className="border-t border-border/80">
                {data?.status === 'OPEN' || data?.status === 'PARTIALLY_PAID' ? (
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Follow-up scheduled', {
                          description: 'Follow-up scheduling arrives with the Members module.'
                        })
                      }
                    >
                      Schedule follow-up
                    </Button>
                    <Button
                      onClick={() =>
                        toast('Record payment', {
                          description: 'Payment recording arrives with the Finance module.'
                        })
                      }
                    >
                      Record payment
                    </Button>
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Print / PDF', {
                          description: 'Printable invoices arrive with the Reports module.'
                        })
                      }
                    >
                      Print / PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Email invoice', {
                          description: 'Email delivery arrives with the Reports module.'
                        })
                      }
                    >
                      Email invoice
                    </Button>
                  </div>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
