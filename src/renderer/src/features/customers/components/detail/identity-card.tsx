import { Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { displayPhone, formatDate } from '@/features/leads/format'
import { formatMonthYear } from '../../format'
import type { Customer } from '../../types'
import { CustomerStatusBadge } from '../status-badge'

/**
 * Customer identity — the stable person at the top of the 360 view. Contact
 * details here are current-record values; historical invoices keep their own
 * snapshots (docs/02 §21).
 */
export function IdentityCard({
  customer,
  status
}: {
  customer: Customer
  status: Parameters<typeof CustomerStatusBadge>[0]['status']
}): React.JSX.Element {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate font-heading text-lg font-semibold tracking-tight">
              {customer.name}
            </h2>
            <CustomerStatusBadge status={status} />
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
            {customer.id} · member since {formatMonthYear(customer.joinedAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Phone className="size-3.5 shrink-0" />
          <span className="tabular-nums">{displayPhone(customer.phone)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{customer.email ?? '—'}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <UserRound className="size-3.5 shrink-0" />
          <span>
            {customer.gender ?? '—'} · {formatDate(customer.dateOfBirth ?? customer.createdAt)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{customer.address ?? '—'}</span>
        </div>
      </div>
    </section>
  )
}
