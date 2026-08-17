import { StatusBadge } from '@/features/customers/components/status-badge'
import type { Offer } from '../types'
import { offerLifecycle } from '../pricing'

export function PlanStatusBadge({ isActive }: { isActive: boolean }): React.JSX.Element {
  return isActive ? (
    <StatusBadge label="Active" tone="success" />
  ) : (
    <StatusBadge label="Inactive" tone="default" />
  )
}

export function OfferLifecycleBadge({ offer }: { offer: Offer }): React.JSX.Element {
  const lifecycle = offerLifecycle(offer)
  const cfg = {
    LIVE: { label: 'Live', tone: 'success' },
    UPCOMING: { label: 'Upcoming', tone: 'primary' },
    ENDED: { label: 'Ended', tone: 'default' },
    PAUSED: { label: 'Paused', tone: 'warning' }
  } as const
  return (
    <StatusBadge
      label={cfg[lifecycle].label}
      tone={cfg[lifecycle].tone}
    />
  )
}