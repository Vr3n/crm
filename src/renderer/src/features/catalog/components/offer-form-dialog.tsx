import { useMemo, useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { DISCOUNT_TYPES, discountTypeLabel, FREE_PERIOD_MONTHS } from '../constants'
import { computeDiscountLine, validateOfferInput } from '../pricing'
import { useCreateOffer, useUpdateOffer } from '../queries'
import type { DiscountType, Offer, Plan } from '../types'
import { CatalogDatePicker } from './catalog-date-picker'

const VALUE_LABEL: Record<DiscountType, string> = {
  PERCENTAGE: 'Discount %',
  FIXED_AMOUNT: 'Discount amount',
  OVERRIDE_PRICE: 'Flat price',
  FREE_PERIOD: 'Free months'
}

const VALUE_PLACEHOLDER: Record<DiscountType, string> = {
  PERCENTAGE: 'e.g. 20',
  FIXED_AMOUNT: 'e.g. 500',
  OVERRIDE_PRICE: 'e.g. 17500',
  FREE_PERIOD: 'e.g. 1'
}

/**
 * Offer editor — create or edit a discount rule. The live preview computes the
 * discount math against each applicable plan (or every plan when none is
 * selected), so staff see the exact sale-time price before saving.
 */
export function OfferFormDialog({
  offer,
  plans,
  open,
  onOpenChange
}: {
  offer: Offer | null
  plans: Plan[]
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const isEdit = offer !== null
  const create = useCreateOffer()
  const update = useUpdateOffer()

  const [name, setName] = useState(offer?.name ?? '')
  const [code, setCode] = useState(offer?.code ?? '')
  const [discountType, setDiscountType] = useState<DiscountType>(offer?.discountType ?? 'PERCENTAGE')
  const [value, setValue] = useState(offer ? String(offer.value) : '')
  const [minPurchase, setMinPurchase] = useState(offer ? String(offer.minPurchase) : '0')
  const [maxUses, setMaxUses] = useState(offer ? String(offer.maxUses) : '100')
  const [applicablePlanIds, setApplicablePlanIds] = useState<number[]>(offer?.applicablePlanIds ?? [])
  const [startDate, setStartDate] = useState(offer?.startDate ?? '')
  const [endDate, setEndDate] = useState(offer?.endDate ?? '')
  const [eligibility, setEligibility] = useState(offer?.eligibility ?? '')
  const [isActive, setIsActive] = useState(offer?.isActive ?? true)

  const error = useMemo(
    () =>
      validateOfferInput({
        name,
        code,
        discountType,
        value: Number(value),
        minPurchase: Number(minPurchase),
        maxUses: Number(maxUses),
        startDate,
        endDate
      }),
    [name, code, discountType, value, minPurchase, maxUses, startDate, endDate]
  )

  const canSubmit = error === null

  function togglePlan(planId: number): void {
    setApplicablePlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId]
    )
  }

  const previewPlans = useMemo(() => {
    const pool = applicablePlanIds.length
      ? plans.filter((p) => applicablePlanIds.includes(p.id))
      : plans
    return pool.slice(0, 4)
  }, [applicablePlanIds, plans])

  const previewCount = applicablePlanIds.length ? applicablePlanIds.length : plans.length
  const freePeriod = discountType === 'FREE_PERIOD' && Number(value) >= 1

  function submit(): void {
    const input = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountType,
      value: Number(value),
      applicablePlanIds,
      minPurchase: Number(minPurchase),
      maxUses: Number(maxUses),
      startDate,
      endDate,
      isActive,
      eligibility: eligibility.trim()
    }
    if (isEdit && offer) {
      update.mutate({ id: offer.id, input }, { onSuccess: () => onOpenChange(false) })
    } else {
      create.mutate(input, { onSuccess: () => onOpenChange(false) })
    }
  }

  const isPending = isEdit ? update.isPending : create.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePercent className="size-4 text-primary" />
            {isEdit ? 'Edit offer' : 'New offer'}
          </DialogTitle>
          <DialogDescription>
            The discount is computed here and snapshotted onto the invoice at sale time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-name">
                Offer name <span className="text-destructive">*</span>
              </Label>
              <Input id="of-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Year Offer" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-code">
                Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="of-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. NEWYEAR20"
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-type">Discount type</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                <SelectTrigger id="of-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-value">
                {VALUE_LABEL[discountType]} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="of-value"
                type="number"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={VALUE_PLACEHOLDER[discountType]}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {discountType === 'FREE_PERIOD' ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quick:</span>
              {FREE_PERIOD_MONTHS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setValue(String(m))}
                >
                  {m} month{m === 1 ? '' : 's'}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-min">Minimum purchase</Label>
              <Input
                id="of-min"
                type="number"
                min={0}
                value={minPurchase}
                onChange={(e) => setMinPurchase(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-max">Usage limit</Label>
              <Input
                id="of-max"
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Applies to</Label>
            <div className="max-h-36 overflow-y-auto rounded-lg border bg-muted/30 p-2">
              {plans.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No plans in the catalog yet.
                </p>
              ) : (
                <div className="grid gap-1">
                  {plans.map((plan) => {
                    const checked = applicablePlanIds.includes(plan.id)
                    return (
                      <label
                        key={plan.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePlan(plan.id)} />
                        <span className="min-w-0 flex-1 truncate text-sm">{plan.name}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatMoney(plan.basePrice)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              No plans selected means the offer applies to every plan in the catalog.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="of-start">Starts</Label>
              <CatalogDatePicker value={startDate} onChange={setStartDate} placeholder="Pick start date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="of-end">Ends</Label>
              <CatalogDatePicker value={endDate} onChange={setEndDate} placeholder="Pick end date" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="of-eligibility">Eligibility</Label>
            <Input
              id="of-eligibility"
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              placeholder="e.g. New joiners and renewals"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Pause to hide it from sale time without deleting.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Pricing preview · {discountTypeLabel(discountType)}
            </p>
            {Number.isFinite(Number(value)) && Number(value) > 0 ? (
              <div className="grid gap-1.5">
                {previewPlans.map((plan) => {
                  const line = computeDiscountLine(
                    {
                      id: 0,
                      name,
                      code,
                      discountType,
                      value: Number(value),
                      applicablePlanIds,
                      minPurchase: Number(minPurchase),
                      maxUses: Number(maxUses),
                      usedCount: 0,
                      startDate,
                      endDate,
                      isActive,
                      eligibility,
                      createdAt: ''
                    },
                    plan.basePrice
                  )
                  return (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-muted-foreground">{plan.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
                        {!freePeriod ? (
                          <span className="text-muted-foreground line-through">
                            {formatMoney(line.original)}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'font-semibold',
                            freePeriod ? 'text-foreground' : 'text-success'
                          )}
                        >
                          {formatMoney(line.final)}
                        </span>
                      </span>
                    </div>
                  )
                })}
                {previewCount > previewPlans.length ? (
                  <p className="text-xs text-muted-foreground">
                    +{previewCount - previewPlans.length} more plan
                    {previewCount - previewPlans.length === 1 ? '' : 's'}
                  </p>
                ) : null}
                {freePeriod ? (
                  <p className="text-xs text-muted-foreground">
                    The {Number(value)} month{Number(value) === 1 ? '' : 's'} of free time is
                    credited on the next billing cycle — this period is priced at base.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Enter a value to see the math.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          {error ? <p className="mr-auto self-center text-xs text-destructive">{error}</p> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}