import { useMemo } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useNow } from '@/lib/use-now'
import { buildCustomerRow } from '../build'
import { useCustomer } from '../queries'
import { CurrentMembershipCard } from '../components/detail/current-membership-card'
import { IdentityCard } from '../components/detail/identity-card'
import { LifetimeCard } from '../components/detail/lifetime-card'
import { MembershipTimeline } from '../components/detail/membership-timeline'
import { ProfileCard } from '../components/detail/profile-card'

/**
 * Customer 360 (Module 02) — the operational view of one person. Identity +
 * account context up top, the current entitlement with freeze status next to
 * the tenure/value snapshot, and the full membership history as the anchor of
 * the page. Back navigation is origin-aware (directory vs memberships list).
 */
export function CustomerDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const now = useNow()
  const { data: customer, isLoading } = useCustomer(id)

  const from = (location.state as { from?: string } | null)?.from ?? '/customers'
  const backLabel = from === '/memberships' ? 'Memberships' : 'Customers'

  const row = useMemo(() => (customer ? buildCustomerRow(customer, now) : null), [customer, now])

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-6 p-6">
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-44 xl:col-span-2" />
          <Skeleton className="h-44" />
          <Skeleton className="h-64 xl:col-span-2" />
          <Skeleton className="h-64" />
          <Skeleton className="h-72 xl:col-span-3" />
        </div>
      </div>
    )
  }

  if (!customer || !row) {
    return (
      <div className="flex w-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="Customer not found"
          description="This customer may have been removed."
          action={
            <Button onClick={() => navigate(from)}>
              <ArrowLeft />
              Back to {backLabel.toLowerCase()}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <div className="flex items-center gap-2">
        <Link to={from}>
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            {backLabel}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <IdentityCard customer={customer} status={row.status} />
        </div>
        <LifetimeCard customer={customer} now={now} />

        <div className="xl:col-span-2">
          <CurrentMembershipCard currentMembership={row.currentMembership} now={now} />
        </div>
        <ProfileCard customer={customer} />

        <div className="xl:col-span-3">
          <MembershipTimeline memberships={customer.memberships} now={now} />
        </div>
      </div>
    </div>
  )
}
