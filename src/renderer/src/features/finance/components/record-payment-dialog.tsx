import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Wallet } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { PAYMENT_METHODS } from '../constants'
import { invoiceDue } from '../build'
import { useOutstandingInvoices, useRecordPayment } from '../queries'
import { CustomerPicker } from './customer-picker'
import type { PersonRef } from '@/features/dashboard/types'
import type { FinanceInvoice } from '../types'

interface AllocationDraft {
  invoice: FinanceInvoice
  amount: number
  enabled: boolean
}

/**
 * Record a payment (Module 05 §15–16, Module 07 §47). Money received is never
 * a one-to-one with an invoice: the dialog lets a single payment be spread
 * across the customer's outstanding invoices, exactly as the allocation model
 * intends. A live reconciliation line keeps the "money in" honest against the
 * "money spread".
 */
export function RecordPaymentDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const record = useRecordPayment()
  const [picked, setPicked] = useState<PersonRef | null>(null)
  const { data: outstanding, isLoading: loadingInvoices } = useOutstandingInvoices(picked?.id)

  const [allocations, setAllocations] = useState<AllocationDraft[]>([])

  const totalAllocated = useMemo(
    () => allocations.filter((a) => a.enabled).reduce((s, a) => s + (a.amount || 0), 0),
    [allocations]
  )

  const form = useForm({
    defaultValues: {
      paymentDate: new Date().toISOString(),
      amount: '',
      method: 'UPI' as string,
      reference: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      if (!picked) return
      const allocs = allocations
        .filter((a) => a.enabled && (a.amount || 0) > 0)
        .map((a) => ({
          invoiceId: a.invoice.id,
          invoiceNo: a.invoice.invoiceNo,
          amount: a.amount
        }))
      try {
        await record.mutateAsync({
          customerId: picked.id,
          paymentDate: value.paymentDate,
          amount: Number(value.amount),
          method: value.method as (typeof PAYMENT_METHODS)[number]['key'],
          reference: value.reference,
          notes: value.notes,
          allocations: allocs
        })
        setPicked(null)
        setAllocations([])
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  const handleCustomerChange = (customer: PersonRef): void => {
    setPicked(customer)
    setAllocations([])
  }

  const selectCustomerAll = (): void => {
    setAllocations((prev) => prev.map((a) => ({ ...a, enabled: true })))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            Record a payment
          </DialogTitle>
          <DialogDescription>
            Money received — optionally spread across the customer&apos;s outstanding invoices.
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
              <CustomerPicker value={picked?.id ?? ''} onChange={handleCustomerChange} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="paymentDate"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a payment date')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
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
                  onChange: ({ value }) => {
                    const n = Number(value)
                    if (!value) return 'Enter an amount'
                    if (!Number.isFinite(n) || n <= 0) return 'Amount must be positive'
                    return undefined
                  }
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
                      Amount (₹) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`pay-${field.name}`}
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

            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="method"
                validators={{
                  onChange: ({ value }) => (value ? undefined : 'Pick a method')
                }}
              >
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>
                      Method <span className="text-destructive">*</span>
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

              <form.Field name="reference">
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`pay-${field.name}`}>Reference</Label>
                    <Input
                      id={`pay-${field.name}`}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="UTR / cheque no."
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* Allocation step — only meaningful once a customer is chosen. */}
            {picked ? (
              <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Allocate across outstanding invoices
                  </Label>
                  <button
                    type="button"
                    onClick={selectCustomerAll}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Apply all
                  </button>
                </div>

                {loadingInvoices ? (
                  <p className="text-xs text-muted-foreground">Loading invoices…</p>
                ) : outstanding?.length ? (
                  <div className="flex flex-col gap-2">
                    {outstanding.map((invoice) => {
                      const due = invoiceDue(invoice)
                      const draft = allocations.find((a) => a.invoice.id === invoice.id)
                      const enabled = draft?.enabled ?? false
                      return (
                        <label
                          key={invoice.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setAllocations((prev) => {
                                const existing = prev.find((a) => a.invoice.id === invoice.id)
                                if (existing) {
                                  return prev.map((a) =>
                                    a.invoice.id === invoice.id ? { ...a, enabled: checked } : a
                                  )
                                }
                                return [...prev, { invoice, amount: due, enabled: checked }]
                              })
                            }}
                            className="size-4 accent-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold tabular-nums">
                              {invoice.invoiceNo}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{invoice.line}</p>
                          </div>
                          {enabled ? (
                            <Input
                              type="number"
                              min={1}
                              value={draft?.amount ?? ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setAllocations((prev) =>
                                  prev.map((a) =>
                                    a.invoice.id === invoice.id ? { ...a, amount: v } : a
                                  )
                                )
                              }}
                              className="h-7 w-28 rounded-md font-mono text-xs tabular-nums"
                            />
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {formatMoney(due)} due
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No outstanding invoices — this will record an advance payment.
                  </p>
                )}

                {totalAllocated > 0 && (
                  <p
                    className={cn(
                      'pt-1 text-xs tabular-nums',
                      totalAllocated > Number(form.state.values.amount) && form.state.values.amount
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    )}
                  >
                    Allocating{' '}
                    <span className="font-medium text-foreground">
                      {formatMoney(totalAllocated)}
                    </span>
                    {form.state.values.amount
                      ? ` of ${formatMoney(Number(form.state.values.amount))}`
                      : ''}
                  </p>
                )}
              </div>
            ) : null}

            <form.Field name="notes">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`pay-${field.name}`}>Notes</Label>
                  <Textarea
                    id={`pay-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional context"
                    rows={2}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({
                canSubmit: s.canSubmit,
                isSubmitting: s.isSubmitting,
                amount: s.values.amount
              })}
            >
              {({ canSubmit, isSubmitting, amount }) => {
                const overAllocated =
                  !!amount && Number(amount) > 0 && totalAllocated > Number(amount)
                return (
                  <Button type="submit" disabled={!canSubmit || !picked || overAllocated}>
                    {isSubmitting ? 'Recording…' : 'Record payment'}
                  </Button>
                )
              }}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
