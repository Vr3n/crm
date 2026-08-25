import { UserPlus, BellPlus, ClipboardList, BadgeCheck, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function soon(title: string): void {
  toast(title, {
    description: 'This arrives with the upcoming module — it\u2019s not wired up yet.'
  })
}

interface QuickAction {
  label: string
  icon: typeof UserPlus
  iconBg: string
  iconColor: string
  onClick: () => void
}

const actions: QuickAction[] = [
  {
    label: 'New Lead',
    icon: UserPlus,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    onClick: () => {} // handled by parent
  },
  {
    label: 'Schedule Follow-Up',
    icon: BellPlus,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    onClick: () => soon('Schedule a follow-up')
  },
  {
    label: 'Schedule Activity',
    icon: ClipboardList,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    onClick: () => soon('Schedule an activity')
  },
  {
    label: 'New Membership Sale',
    icon: BadgeCheck,
    iconBg: 'bg-secondary/10',
    iconColor: 'text-secondary',
    onClick: () => soon('Membership sale')
  }
]

/**
 * Dashboard quick actions (plan §8). Four equal-width compact action buttons
 * on desktop with tinted icon tiles, trailing plus icons, and micro-interaction
 * choreography (lift, shadow, border tint, press return).
 */
export function DashboardActions({ onNewLead }: { onNewLead: () => void }): React.JSX.Element {
  const handleClick = (action: QuickAction, index: number): void => {
    if (index === 0) onNewLead()
    else action.onClick()
  }

  return (
    <section aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {actions.map((action, i) => {
        const Icon = action.icon
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => handleClick(action, i)}
            className={cn(
              'crm-hover-lift group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium text-foreground shadow-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2'
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-180 ease-out group-hover:scale-105',
                action.iconBg
              )}
            >
              <Icon className={cn('size-5', action.iconColor)} />
            </span>
            <span className="flex-1 truncate">{action.label}</span>
            <Plus className="size-4 shrink-0 text-muted-foreground/50 transition-colors duration-180 group-hover:text-primary" />
          </button>
        )
      })}
    </section>
  )
}
