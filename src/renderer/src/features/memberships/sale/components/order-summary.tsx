import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import type { Plan } from '@/features/catalog/types'

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const

export function OrderSummary({
  plan = null,
  basePrice = null,
  discountType = '',
  discountValue = '',
  discountAmount = 0,
  finalPrice = null,
  paidInput = '',
  paidAmount = null,
  paymentMethod = '',
  onPaidChange,
  onPaymentMethodChange,
  isDirty = false,
  leadName = null
}: {
  plan?: Plan | null
  basePrice?: number | null
  discountType?: string
  discountValue?: string
  discountAmount?: number
  finalPrice?: number | null
  paidInput?: string
  paidAmount?: number | null
  paymentMethod?: string | null
  onPaidChange?: (v: string) => void
  onPaymentMethodChange?: (v: string) => void
  isDirty?: boolean
  leadName?: string | null
}): React.JSX.Element {
  const amountDue = finalPrice !== null && paidAmount !== null ? Math.max(0, finalPrice - paidAmount) : null
  const changeDue = finalPrice !== null && paidAmount !== null ? Math.max(0, paidAmount - finalPrice) : null

  const discountTypeLabel = discountType ? discountType.replace('_', ' ') : '—'
  const discountValueLabel =
    discountValue !== '' && discountType
      ? discountType === 'PERCENTAGE'
        ? `${discountValue}%`
        : discountType === 'FREE_PERIOD'
          ? `${discountValue} months`
          : `₹${Number(discountValue.replace(/,/g, '')).toLocaleString('en-IN')}`
      : '—'
  const discountAmountLabel = discountAmount > 0 ? `-${formatRupees(discountAmount)}` : '—'

  return (
    <Card className="gap-0 rounded-2xl border bg-card py-0 shadow-sm">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-sm font-semibold tracking-tight">Order summary</CardTitle>
        <p className="text-xs text-muted-foreground">Live preview — updates as you type</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 px-0 pb-0">
        {/* Plan line */}
        <div className="px-5 pb-3">
          {plan ? (
            <>
              <p className="truncate text-sm font-medium">{plan.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {plan.duration} ({plan.duration === 'MONTHLY' ? 30 : plan.duration === 'QUARTERLY' ? 90 : plan.duration === 'HALF_YEARLY' ? 180 : 365} days)
                {leadName ? ` · ${leadName}` : ''}
                {isDirty && basePrice !== null ? ` · Edited` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">No plan selected</p>
              <p className="text-[11px] text-muted-foreground/70">Pick a plan to see pricing</p>
            </>
          )}
        </div>

        <Separator />

        {/* Totals */}
        <div className="flex flex-col gap-2 px-5 py-3 text-sm">
          <Row label="Base Price" value={basePrice !== null ? formatRupees(basePrice) : '—'} />
          <Row label="Discount type" value={discountTypeLabel} muted />
          <Row label="Discount value" value={discountValueLabel} muted />
          <Row
            label="Discount amount"
            value={discountAmountLabel}
            muted
            valueClass={discountAmount > 0 ? 'text-success font-medium' : undefined}
          />
          <Row label="Tax" value={plan ? `${plan.taxRate}%` : '—'} muted dim />
          <Row label="Registration fee" value={plan && plan.registrationFee > 0 ? formatRupees(plan.registrationFee) : '—'} muted dim />
        </div>

        <Separator />

        {/* Final */}
        <div className="flex items-center justify-between bg-muted/50 px-5 py-3">
          <span className="text-sm font-semibold tracking-tight">Final Price</span>
          <span aria-live="polite" className="font-mono text-sm font-semibold tabular-nums">
            {finalPrice !== null ? formatRupees(finalPrice) : '—'}
          </span>
        </div>

        <Separator />

        {/* Paid Amount — editable inside summary */}
        <div className="flex flex-col gap-3 px-5 py-3">
          <div className="grid gap-1.5">
            <Label htmlFor="summary-paid" className="text-xs">
              Paid Amount <span className="text-destructive">*</span>
              {finalPrice !== null ? <span className="font-normal text-muted-foreground"> · of {formatRupees(finalPrice)}</span> : null}
            </Label>
            <Input
              id="summary-paid"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 4000"
              value={paidInput}
              onChange={(e) => {
                let v = e.target.value.replace(/[^0-9.,]/g, '')
                const firstDot = v.indexOf('.')
                if (firstDot !== -1) {
                  const before = v.slice(0, firstDot + 1)
                  const after = v.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
                  v = before + after
                }
                onPaidChange?.(v)
              }}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="summary-method" className="text-xs">
              Payment Type <span className="text-destructive">*</span>
            </Label>
            <Select value={paymentMethod ?? ''} onValueChange={(v) => onPaymentMethodChange?.(v)}>
              <SelectTrigger id="summary-method">
                <SelectValue placeholder="Choose method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Emphasis */}
        <div className="px-5 py-3">
          {finalPrice !== null && paidAmount !== null ? (
            amountDue !== null && amountDue > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs font-medium text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-400">
                Amount due {formatRupees(amountDue)}
              </div>
            ) : changeDue !== null && changeDue > 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-xs font-medium text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-400">
                Change due {formatRupees(changeDue)}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-xs font-medium text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/30 dark:text-emerald-400">
                Paid in full ✓
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
              Amount due / change appears after payment
            </div>
          )}
        </div>

        {/* Live region for screen readers */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Order summary — {finalPrice !== null ? `final ${finalPrice}` : 'no final'} {paidAmount !== null ? `paid ${paidAmount}` : ''}
        </p>
      </CardContent>
    </Card>
  )
}

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function Row({
  label,
  value,
  muted,
  dim,
  valueClass
}: {
  label: string
  value: string
  muted?: boolean
  dim?: boolean
  valueClass?: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? (dim ? 'text-xs text-muted-foreground/60' : 'text-muted-foreground') : ''}>
        {label}
      </span>
      <span className={['font-mono tabular-nums', valueClass ?? ''].filter(Boolean).join(' ')}>{value}</span>
    </div>
  )
}
