import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

/**
 * Tally-style Order Summary (01 §1.2). In this scaffold phase the values are
 * placeholders (--). Later phases (03/05) bind live pricing via hooks.
 */
export function OrderSummary(): React.JSX.Element {
  return (
    <Card className="gap-0 rounded-2xl border bg-card py-0 shadow-sm">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-sm font-semibold tracking-tight">Order summary</CardTitle>
        <p className="text-xs text-muted-foreground">Live preview — updates as you type</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 px-0 pb-0">
        {/* Plan line */}
        <div className="px-5 pb-3">
          <p className="text-xs text-muted-foreground">No plan selected</p>
          <p className="text-[11px] text-muted-foreground/70">Pick a plan to see pricing</p>
        </div>

        <Separator />

        {/* Totals */}
        <div className="flex flex-col gap-2 px-5 py-3 text-sm">
          <Row label="Base Price" value="—" />
          <Row label="Discount" value="—" muted />
          <Row label="Tax" value="—" muted dim />
          <Row label="Registration fee" value="—" muted dim />
        </div>

        <Separator />

        {/* Final */}
        <div className="flex items-center justify-between bg-muted/50 px-5 py-3">
          <span className="text-sm font-semibold tracking-tight">Final Price</span>
          <span aria-live="polite" className="font-mono text-sm font-semibold tabular-nums">
            —
          </span>
        </div>

        <Separator />

        {/* Paid */}
        <div className="flex flex-col gap-2 px-5 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-mono tabular-nums">—</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Method</span>
            <Badge variant="outline" className="text-[11px] font-normal">
              —
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Emphasis */}
        <div className="px-5 py-3">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
            Amount due / change appears after payment
          </div>
        </div>

        {/* Live region for screen readers */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Order summary — no plan or payment yet
        </p>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  muted,
  dim
}: {
  label: string
  value: string
  muted?: boolean
  dim?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? (dim ? 'text-xs text-muted-foreground/60' : 'text-muted-foreground') : ''}>
        {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  )
}
