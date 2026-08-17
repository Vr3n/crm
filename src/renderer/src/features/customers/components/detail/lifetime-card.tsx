import { CircleDashed, UserCheck, UserCog } from 'lucide-react'
import { formatMonthYear, monthsSince } from '../../format'
import type { Customer } from '../../types'

/**
 * Tenure & value snapshot for the 360 view. Every number here is derived from
 * the membership history (docs/09 read-model rule) — lifetime value is the sum
 * of paid entitlement snapshots, never a stored counter.
 */
export function LifetimeCard({
  customer,
  now
}: {
  customer: Customer
  now: number
}): React.JSX.Element {
  const lifetimeValue = customer.memberships.reduce(
    (sum, m) => sum + (m.price - m.discount + m.registrationFee),
    0
  )
  const freezeDays = customer.memberships.reduce(
    (sum, m) =>
      sum +
      m.freezes.reduce(
        (s, f) =>
          s +
          Math.round(
            (new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / 86_400_000
          ),
        0
      ),
    0
  )

  const rows: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
  }[] = [
    {
      icon: UserCheck,
      label: 'Member for',
      value: `${monthsSince(customer.joinedAt, now)} months`
    },
    {
      icon: CircleDashed,
      label: 'Memberships',
      value: `${customer.memberships.length} total`
    },
    {
      icon: UserCog,
      label: 'Owned by',
      value: customer.ownerName ?? 'Unassigned'
    },
    {
      icon: CircleDashed,
      label: 'Freeze days on record',
      value: `${freezeDays} days`
    }
  ]

  return (
    <section className="flex flex-col rounded-lg border bg-card p-5">
      <h3 className="text-sm font-medium">Tenure & value</h3>
      <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
        {new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0
        }).format(lifetimeValue)}
      </p>
      <p className="text-xs text-muted-foreground">
        lifetime value · since {formatMonthYear(customer.joinedAt)}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <r.icon className="size-3.5" />
              {r.label}
            </span>
            <span className="text-right font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
