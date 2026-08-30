import { CreditCard, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { effectiveStatus } from '../../build'
import { formatMoney, formatShortDate } from '../../format'
import type { Membership } from '../../types'
import { MembershipStatusBadge } from '../status-badge'

/**
 * Overview of ONE purchased membership (Module 02 snapshot): plan, commercial
 * terms, entitlement window and freeze state — everything needed to answer
 * "what did this member buy?" without opening another screen. Values are the
 * sale-time snapshot in finished rupees; never recomputed from the plan.
 *
 * `variant="hero"` renders the anchor cell of the bento grid: larger type,
 * bigger price, more internal padding. The default variant is the compact
 * supporting cell.
 */
export function MembershipOverviewCard({
  membership,
  now,
  variant = 'default',
  className
}: {
  membership: Membership
  now: number
  variant?: 'default' | 'hero'
  className?: string
}): React.JSX.Element {
  const m = membership
  const eff = effectiveStatus(m, now)
  const startMs = new Date(m.startDate).getTime()
  const endMs = new Date(m.endDate).getTime()
  const elapsed = Math.max(0, Math.min(1, (now - startMs) / Math.max(1, endMs - startMs)))
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86_400_000))
  const paid = m.price - m.discount
  const openFreezes = m.freezes.filter(
    (f) => new Date(f.startDate).getTime() <= now && new Date(f.endDate).getTime() > now
  )

  const hero = variant === 'hero'

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-card shadow-sm',
        hero ? 'p-6' : 'p-5',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CreditCard className="size-3.5" /> Membership #{m.id}
        </span>
        <MembershipStatusBadge status={eff} />
      </div>

      <p
        className={cn(
          'mt-3 font-heading font-semibold tracking-tight',
          hero ? 'text-xl' : 'text-lg'
        )}
      >
        {m.plan}
      </p>
      <p className="text-xs text-muted-foreground">
        {m.billingFrequency.charAt(0) + m.billingFrequency.slice(1).toLowerCase()} billing
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t pt-3">
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>
            Base <span className="font-mono tabular-nums text-foreground">{formatMoney(m.price)}</span>
          </span>
          <span>
            Discount{' '}
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              −{formatMoney(m.discount)}
            </span>
          </span>
          {m.registrationFee > 0 ? (
            <span>
              Registration{' '}
              <span className="font-mono tabular-nums text-foreground">
                +{formatMoney(m.registrationFee)}
              </span>
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <p
            className={cn(
              'font-mono font-semibold tabular-nums',
              hero ? 'text-2xl' : 'text-xl'
            )}
          >
            {formatMoney(paid)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Final price</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
          <span className="text-blue-600 dark:text-blue-400">{formatShortDate(m.startDate)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-purple-600 dark:text-purple-400">{formatShortDate(m.endDate)}</span>
        </span>
        <span className="font-mono text-xs font-medium tabular-nums">{daysLeft}d left</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${elapsed * 100}%` }} />
      </div>

      {openFreezes.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {openFreezes.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              Frozen {formatShortDate(f.startDate)} → {formatShortDate(f.endDate)}
              {f.reason ? ` · ${f.reason}` : ''}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <Receipt className="size-3.5" /> sold {formatShortDate(m.createdAt)}
      </div>
    </div>
  )
}
