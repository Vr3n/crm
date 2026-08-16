import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LOST_REASONS } from '../constants'
import { useMarkLost } from '../queries'
import type { Lead, LostReasonKey } from '../types'

/**
 * Lost leads must record *why* they were lost (Module 01 §26) — a bare
 * `stage = LOST` with no reason would silently poison sales analysis. This
 * dialog forces the reason and captures a closing note.
 */
export function MarkLostDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const mark = useMarkLost()
  const reasons = Object.keys(LOST_REASONS) as LostReasonKey[]
  const [reason, setReason] = useState<LostReasonKey | undefined>()
  const [note, setNote] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-4" />
            Mark {lead.name} as lost
          </DialogTitle>
          <DialogDescription>
            Record why this lead did not convert — it feeds your sales analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lost-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LostReasonKey)}>
              <SelectTrigger id="lost-reason">
                <SelectValue placeholder="Why was it lost?" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {LOST_REASONS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lost-note">Note</Label>
            <Textarea
              id="lost-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional closing note"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              mark.mutate(
                { id: lead.id, reason: reason!, note: note.trim() },
                { onSuccess: () => onOpenChange(false) }
              )
            }
            disabled={mark.isPending || !reason}
          >
            {mark.isPending ? 'Saving…' : 'Mark as lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}