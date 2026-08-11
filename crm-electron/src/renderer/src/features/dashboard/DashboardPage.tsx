import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, CalendarClock, TrendingUp } from "lucide-react";

const metrics = [
  { label: "Total Leads", value: "—", icon: Users },
  { label: "Memberships Sold", value: "—", icon: CreditCard },
  { label: "Expiring Soon", value: "—", icon: CalendarClock },
  { label: "Outstanding Balance", value: "—", icon: TrendingUp },
];

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome to Crown CRM. Overview cards will light up as modules land.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {m.label}
              </CardTitle>
              <m.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{m.value}</div>
              <p className="text-xs text-muted-foreground">Connects in M5</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Populated by the M5 report queries.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">DB ready</Badge>
            <span>Waiting on modules 5+ for live data.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
