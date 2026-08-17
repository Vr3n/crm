import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { formatMoney } from '@/features/dashboard/format'
import { PAYMENT_METHODS } from '../constants'
import { useIssueRefund, usePaymentsFor } from '../queries'
import { CustomerPicker } from './customer-picker'
import type { PersonRef } from '@/features/dashboard/types'
import type { PaymentMethod, Refund } from '../types'

/**
 * Issue a refund (Module 05 §17). The refund is a separate, dated, reasoned
 * event against one of the customer's recorded payments — the source payment is
 * never edited. The amount can't exceed what is still available on that payment
 * (its value minus any refunds already issued against it).
 */
export function IssueRefundDialog({
  open,
  onOpenChange,
  refunds
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  refunds: Refund[]
}): React.JSX.Element {
  const issue = useIssueRefund()
  const [picked, setPicked] = useState<PersonRef | null>(null)
  const { data: payments, isLoading: loadingPayments } = usePaymentsFor(picked?.id)

  const remainingByPayment = useMemo(
    () =>
      new Map<string, number>(
        (payments ?? []).map((p) => [
          p.id,
          p.amount -
            refunds.filter((r) => r.sourcePaymentId === p.id).reduce((s, r) => s + r.amount, 0)
        ])
      ),
    [payments, refunds]
  )

  const form = useForm({
    defaultValues: {
      refundDate: new Date().toISOString(),
      amount: '',
      sourcePaymentId: '',
      method: 'UPI' as string,
      reason: ''
    },
    onSubmit: async ({ value }) => {
      if (!picked) return
      const source = payments?.find((p) => p.id === value.sourcePaymentId)
      if (!source) return
      try {
        await issue.mutateAsync({
          customerId: picked.id,
          refundDate: value.refundDate,
          amount: Number(value.amount),
          sourcePaymentId: source.id,
          sourcePaymentNo: source.paymentNo,
          method: value.method as PaymentMethod,
          reason: value.reason
        })
        setPicked(null)
        form.reset()
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  const remaining =
    (form.state.values.sourcePaymentId
      ? remainingByPayment.get(form.state.values.sourcePaymentId)
      : undefined) ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-4 text-destructive" />
            Issue a refund
          </DialogTitle>
          <DialogDescription>
            Money returned to the customer — a separate record layered on top of a payment.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>
                Customer <span className="text-destructive">*</span>
              </Label>
              <CustomerPicker
                value={picked?.id ?? ''}
                onChange={(customer) => {
                  setPicked(customer)
                  form.setFieldValue('sourcePaymentId', '')
                }}
              />
            </div>

            {picked ? (
              <form.Field
                name="sourcePaymentId"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick the payment to refund')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`rf-${field.name}`}>
                      Refund against <span className="text-destructive">*</span>
                    </Label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger size="default" className="h-9 rounded-md text-sm">
                        <SelectValue
                          placeholder={loadingPayments ? 'Loading…' : 'Select a payment'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(payments ?? []).map((p) => {
                          const avail = remainingByPayment.get(p.id) ?? 0
                          return (
                            <SelectItem key={p.id} value={p.id} disabled={avail <= 0}>
                              <span className="font-mono tabular-nums">
                                {p.paymentNo} · {formatMoney(p.amount)}
                              </span>
                              {avail <= 0 ? ' · fully refunded' : ` · ${formatMoney(avail)} left`}
                            </SelectItem>
                          )
                        })}
                        {!loadingPayments && !payments?.length ? (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            No payments recorded for this customer.
                          </p>
                        ) : null}
                      </SelectContent>
                    </Select>
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="refundDate"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a date')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`rf-${field.name}`}>
                      Date <span className="text-destructive">*</span>
                    </Label>
                    <DateTimePicker
                      value={field.state.value}
                      onChange={(iso) => field.handleChange(iso)}
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field
                name="amount"
                validators={{
                  onChange: ({ value, fieldApi }) => {
                    const n = Number(value)
                    if (!value) return 'Enter an amount'
                    if (!Number.isFinite(n) || n <= 0) return 'Amount must be positive'
                    const sourceId = fieldApi.form.getFieldValue('sourcePaymentId')
                    const avail = sourceId ? (remainingByPayment.get(sourceId) ?? 0) : 0
                    if (avail > 0 && n > avail)
                      return `At most ${formatMoney(avail)} is available on this payment`
                    return undefined
                  }
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`rf-${field.name}`}>
                      Amount (₹) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`rf-${field.name}`}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="0"
                    />
                    {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                      <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                    ) : null}
                  </div>
                )}
              </form.Field>
            </div>

            {remaining > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(remaining)} available on the selected payment
              </p>
            ) : null}

            <form.Field
              name="method"
              validators={{
                onChange: ({ value }) => (value ? undefined : 'Pick a method')
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`rf-${field.name}`}>
                    Return method <span className="text-destructive">*</span>
                  </Label>
                  <Select value={field.state.value} onValueChange={field.handleChange}>
                    <SelectTrigger size="default" className="h-9 rounded-md text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="reason"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Why is this being refunded?'
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`rf-${field.name}`}>
                    Reason <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id={`rf-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. PT package cancelled — unused sessions"
                    rows={2}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" variant="destructive" disabled={!canSubmit || !picked}>
                  {isSubmitting ? 'Issuing…' : 'Issue refund'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
