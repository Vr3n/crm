import { useMemo } from 'react'
import {
  IndianRupee,
  CircleAlert,
  Users,
  UserPlus,
  CalendarClock,
  BellRing,
  Wallet,
  Receipt
} from 'lucide-react'
import { useSession } from '@/context/session-context'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Operational dashboard (Module 09 §58). Prioritises work, not vanity stats:
 * follow-ups, dues, collections, expiring memberships. Every number is a read
 * model over the transactional tables — until those exist the tiles render an
 * honest "--" and the lists an invitation to start recording.
 */
export function Dashboard(): React.JSX.Element {
  const session = useSession()
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <PageHeader
        title={`${greeting}, ${session.userFullName.split(' ')[0]}`}
        description={`${session.organizationName} · ${session.roleName}`}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Today's collections" icon={IndianRupee} tone="success" />
        <StatCard label="Outstanding dues" icon={CircleAlert} tone="warning" />
        <StatCard label="Active members" icon={Users} />
        <StatCard label="New leads today" icon={UserPlus} tone="primary" />
        <StatCard label="Expiring soon" icon={CalendarClock} />
      </div>

      {/* Operational lists */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4 text-primary" />
              Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={BellRing}
              title="No follow-ups yet"
              description="Follow-ups you schedule on leads will appear here, due today and overdue."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-primary" />
              Recent payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Wallet}
              title="No payments recorded"
              description="Record your first payment to see it here, with its method and allocation."
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="size-4 text-primary" />
              Today&apos;s collection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Receipt}
              title="Nothing collected yet today"
              description="Cash, UPI, card and bank-transfer totals will be broken out here as payments land."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
