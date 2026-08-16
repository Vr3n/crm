import { PhoneCall, BellPlus, ArrowRight, XCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isTerminal } from '../../constants'
import type { Lead } from '../../types'

export type QuickActionType = 'activity' | 'followup' | 'move' | 'lost' | 'convert'

/**
 * Quick actions on the detail page — the primary verbs a staff member uses
 * with a lead. WON/LOST are terminal, so move/mark-lost/convert hide once the
 * lead has closed.
 */
export function QuickActions({
  lead,
  onAction
}: {
  lead: Lead
  onAction: (a: QuickActionType) => void
}): React.JSX.Element {
  const terminal = isTerminal(lead.stage)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" className="justify-start" onClick={() => onAction('activity')}>
          <PhoneCall className="text-primary" />
          Log activity
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => onAction('followup')}>
          <BellPlus className="text-primary" />
          Add follow-up
        </Button>
        {!terminal && (
          <Button variant="outline" className="justify-start" onClick={() => onAction('move')}>
            <ArrowRight className="text-primary" />
            Move stage
          </Button>
        )}
        {!terminal && (
          <Button
            variant="outline"
            className="justify-start text-destructive hover:bg-destructive/10"
            onClick={() => onAction('lost')}
          >
            <XCircle className="text-destructive" />
            Mark as lost
          </Button>
        )}
        {!terminal && (
          <Button className="justify-start" onClick={() => onAction('convert')}>
            <CheckCircle2 />
            Convert
          </Button>
        )}
      </CardContent>
    </Card>
  )
}