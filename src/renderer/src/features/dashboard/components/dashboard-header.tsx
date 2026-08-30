import { format } from 'date-fns'
import { useSession } from '@/context/session-context'

/**
 * Dashboard masthead (plan §7). The greeting is the dashboard's human layer:
 * a small date line in muted text, a main heading with the user's name
 * (final punctuation in teal), and a right-aligned system health status
 * with a subtle pulse dot.
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
  const today = format(new Date(), 'EEEE, MMMM d')

  return (
    <section aria-label="Dashboard greeting" className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {greeting}, <span className="text-primary">{firstName}</span>.
        </h1>
      </div>
      <div className="flex items-center gap-2" role="status" aria-label="System status">
        <span className="crm-pulse size-2 rounded-full bg-success" aria-hidden="true" />
        <span className="text-xs font-medium text-muted-foreground">All systems healthy</span>
      </div>
    </section>
  )
}
