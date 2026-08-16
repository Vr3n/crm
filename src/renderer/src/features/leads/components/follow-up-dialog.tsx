import { useState } from 'react'
import { BellPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddFollowUp } from '../queries'
import type { Lead } from '../types'

export function FollowUpDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const add = useAddFollowUp()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellPlus className="size-4 text-primary" />
            Schedule a follow-up · {lead.name}
          </DialogTitle>
          <DialogDescription>
            A future action you intend to take with this lead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fu-title">
              What to do <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fu-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call to confirm trial"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fu-due">
              Due <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fu-due"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fu-note">Note</Label>
            <Textarea
              id="fu-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional context"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              add.mutate(
                { id: lead.id, title, dueAt: new Date(due).toISOString(), note: note.trim() || undefined },
                { onSuccess: () => onOpenChange(false) }
              )
            }
            disabled={add.isPending || !title.trim() || !due}
          >
            {add.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}