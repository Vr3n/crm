import {
  LayoutDashboard,
  Users,
  CreditCard,
  CalendarCheck,
  Dumbbell,
  Settings,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Members', icon: Users },
  { label: 'Payments', icon: CreditCard },
  { label: 'Check-ins', icon: CalendarCheck },
  { label: 'Trainers', icon: Settings }
]

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Dumbbell className="size-5" />
        </div>
        <span className="text-lg font-semibold">GymCRM</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              item.active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="border-t p-3">
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}