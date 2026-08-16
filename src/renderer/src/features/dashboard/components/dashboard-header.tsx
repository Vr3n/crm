import { useSession } from '@/context/session-context'

/**
 * Dashboard masthead. The organization name lives in the sidebar brand slot,
 * so the page header greets the signed-in staff member instead of repeating
 * it. The staff identity is also in the sidebar chip, so no identity is shown
 * twice.
 */
export function DashboardHeader(): React.JSX.Element {
  const session = useSession()
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = session.userFullName.split(' ')[0] ?? session.userFullName

  return (
    <div>
      <h1 className="text-sm text-muted-foreground">
        {greeting}, {firstName}.
      </h1>
    </div>
  )
}
