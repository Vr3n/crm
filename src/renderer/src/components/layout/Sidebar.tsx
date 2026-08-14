import { Crown, LogOut } from 'lucide-react'
import { initials } from '@/lib/validation'

interface SidebarProps {
  userFullName: string
  roleName: string
  onSignOut: () => void
}

export function Sidebar({ userFullName, roleName, onSignOut }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Crown className="size-5" />
        </div>
        <span className="font-heading text-lg font-semibold tracking-tight">CrownCRM</span>
      </div>

      <div className="flex-1" />

      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-3 rounded-md px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
            {initials(userFullName)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{userFullName}</div>
            <div className="truncate text-xs text-muted-foreground">{roleName}</div>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
