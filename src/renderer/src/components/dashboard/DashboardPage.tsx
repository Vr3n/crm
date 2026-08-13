import { useEffect, useState } from 'react'
import { Users, UserCheck, DollarSign, CalendarCheck } from 'lucide-react'
import type { DashboardData } from '@/lib/types'
import { StatCard } from '@/components/dashboard/StatCard'
import { RecentMembers } from '@/components/dashboard/RecentMembers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Avatar,
  AvatarFallback
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    window.api.db.getDashboard().then(setData).catch(console.error)
  }, [])

  const stats = data?.stats

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back! Here is what&apos;s happening today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input className="w-56" placeholder="Search members..." />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-9 rounded-full p-0">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-secondary text-secondary-foreground">GS</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Gym Staff</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Separator />

      <main className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Members"
            value={stats ? String(stats.totalMembers) : '-'}
            hint="All registered members"
            icon={Users}
          />
          <StatCard
            title="Active Members"
            value={stats ? String(stats.activeMembers) : '-'}
            hint="Currently on an active plan"
            icon={UserCheck}
            accent
          />
          <StatCard
            title="Monthly Revenue"
            value={stats ? `$${stats.monthlyRevenue.toFixed(0)}` : '-'}
            hint="Revenue this month"
            icon={DollarSign}
          />
          <StatCard
            title="Check-ins Today"
            value={stats ? String(stats.checkinsToday) : '-'}
            hint="Members visited today"
            icon={CalendarCheck}
            accent
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentMembers members={data?.recentMembers ?? []} />
          </div>
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="secondary">
                Add new member
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                Record payment
              </Button>
              <Button className="w-full justify-start" variant="secondary">
                Log a check-in
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
