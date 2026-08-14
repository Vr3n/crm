import { Routes, Route, Navigate } from 'react-router-dom'
import { Search, Kanban, BellRing, PhoneCall, Users, CreditCard, Package, BadgePercent, Receipt, Landmark, Wallet, Undo2, BarChart3, UserCog, Building2 } from 'lucide-react'
import { AppLayout } from '@/layouts/AppLayout'
import { Dashboard } from '@/pages/dashboard'
import { ModulePlaceholder } from '@/pages/module-placeholder'
import { can, useSession } from '@/context/session-context'

/** Route guard mirroring the nav gate: super OR the permission code. */
function Protected({ code, children }: { code: string; children: React.ReactNode }): React.JSX.Element {
  const session = useSession()
  if (!can(session.permissions, session.isSuper, code)) return <Navigate to="/" replace />
  return <>{children}</>
}

const MODULES: {
  path: string
  title: string
  description: string
  scope: string
  icon: typeof Search
  requires?: string
}[] = [
  {
    path: 'search',
    title: 'Find a person',
    description: 'Search customers and leads by name, phone, email, membership ID or invoice number.',
    scope: 'Module 09 · Customer 360',
    icon: Search
  },
  {
    path: 'leads',
    title: 'Sales pipeline',
    description: 'Manage leads across their stages and log the activities that move them forward.',
    scope: 'Module 01 · Sales',
    icon: Kanban
  },
  {
    path: 'followups',
    title: 'Follow-ups',
    description: 'See today\u2019s and overdue follow-ups, and complete the ones you\u2019ve handled.',
    scope: 'Module 01 · Sales',
    icon: BellRing
  },
  {
    path: 'activities',
    title: 'Activities',
    description: 'A chronological history of every call, visit, tour and discussion with each person.',
    scope: 'Module 01 · Sales',
    icon: PhoneCall
  },
  {
    path: 'customers',
    title: 'Customers',
    description: 'The customer directory, with a 360 view of memberships, billing and history.',
    scope: 'Module 02 · People',
    icon: Users
  },
  {
    path: 'memberships',
    title: 'Memberships',
    description: 'Every purchased entitlement period, including renewals, freezes and cancellations.',
    scope: 'Module 02 · People',
    icon: CreditCard
  },
  {
    path: 'plans',
    title: 'Membership plans',
    description: 'Reusable commercial definitions: duration, price, billing frequency and rules.',
    scope: 'Module 03 · Catalog',
    icon: Package
  },
  {
    path: 'offers',
    title: 'Offers',
    description: 'Pricing rules applied at sale time; historical invoices keep their own snapshot.',
    scope: 'Module 03 · Catalog',
    icon: BadgePercent
  },
  {
    path: 'invoices',
    title: 'Invoices',
    description: 'Finalized obligations with immutable lines, tax and numbering.',
    scope: 'Module 04 · Billing',
    icon: Receipt
  },
  {
    path: 'collections',
    title: 'Daily collection',
    description: 'Cash, UPI, card and transfer totals, reconstructed from payments.',
    scope: 'Module 05 · Finance',
    icon: Landmark
  },
  {
    path: 'payments',
    title: 'Payments',
    description: 'Money received, allocated across invoices, with refunds and credits kept separate.',
    scope: 'Module 05 · Finance',
    icon: Wallet
  },
  {
    path: 'refunds',
    title: 'Refunds & credits',
    description: 'Money returned versus value kept on account for a future invoice.',
    scope: 'Module 05 · Finance',
    icon: Undo2
  },
  {
    path: 'reports',
    title: 'Reports',
    description: 'Finance and membership analytics derived from the transactional tables.',
    scope: 'Module 09 · Reporting',
    icon: BarChart3
  },
  {
    path: 'settings/users',
    title: 'Users & roles',
    description: 'Staff accounts and the roles and permissions that gate every action.',
    scope: 'Module 15 · RBAC',
    icon: UserCog,
    requires: 'user.view'
  },
  {
    path: 'settings/organization',
    title: 'Organization',
    description: 'Your gym\u2019s identity, timezone and currency.',
    scope: 'Module 14 · Tenancy',
    icon: Building2,
    requires: 'org.view'
  }
]

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {MODULES.map((m) => {
          const element = (
            <ModulePlaceholder title={m.title} description={m.description} scope={m.scope} icon={m.icon} />
          )
          return (
            <Route
              key={m.path}
              path={m.path}
              element={m.requires ? <Protected code={m.requires}>{element}</Protected> : element}
            />
          )
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}