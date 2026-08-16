import { useSession } from '@/context/session-context'

/**
 * Dashboard masthead. The Organization is the large title with the greeting
 * demoted to a small subtitle. The signed-in staff member's identity is already
 * shown in the sidebar chip, so it is not repeated here.
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
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {session.organizationName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {greeting}, {firstName}.
      </p>
    </div>
  )
}