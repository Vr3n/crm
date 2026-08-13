import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  hint: string
  icon: LucideIcon
  accent?: boolean
}

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  accent = false
}: StatCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-lg',
            accent ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}