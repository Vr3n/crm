import { useState } from 'react'
import { CheckCircle2, CornerDownRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useConvert } from '../queries'
import type { Lead } from '../types'

/**
 * Winning a lead is an explicit conversion handoff (Module 01 §22–23): it
 * produces a Customer/Membership, not a bare status flip. Module 02 is not
 * built yet, so this dialog acknowledges the WON state and notes the pending
 * customer record — a stub of the real handoff.
 */
export function ConvertDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const convert = useConvert()
  const [ack, setAck] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-4" />
            Convert {lead.name}
          </DialogTitle>
          <DialogDescription>
            Winning this lead marks it as a converted customer. Creating the
            Customer & Membership (Module 02) is a separate step that will be
            wired here later.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm">
          <p className="flex items-start gap-2 text-muted-foreground">
            <CornerDownRight className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              This is a <strong>stub handoff</strong>. Confirming moves the lead to{' '}
              <strong>Won</strong>; a real conversion will open a &ldquo;Create member&rdquo;
              flow and link the resulting customer.
            </span>
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          I understand a customer record isn&apos;t created yet.
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => convert.mutate(lead.id, { onSuccess: () => onOpenChange(false) })}
            disabled={convert.isPending || !ack}
          >
            {convert.isPending ? 'Converting…' : 'Mark as won'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}