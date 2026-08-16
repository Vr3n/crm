import { useState } from 'react'
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
import { ACTIVITY_LABELS } from '../constants'
import { useLogActivity } from '../queries'
import type { ActivityTypeKey, Lead } from '../types'

const TYPES = Object.keys(ACTIVITY_LABELS) as ActivityTypeKey[]

export function LogActivityDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const log = useLogActivity()
  const [type, setType] = useState<ActivityTypeKey>('PHONE_CALL')
  const [note, setNote] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log an activity · {lead.name}</DialogTitle>
          <DialogDescription>
            Record what happened. Activities are history — they are never edited.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="act-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ActivityTypeKey)}>
              <SelectTrigger id="act-type">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.filter((t) => !t.includes('LEAD_CREATED')).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTIVITY_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="act-note">Note</Label>
            <Textarea
              id="act-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened on this touchpoint?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              log.mutate({ id: lead.id, type, note: note.trim() }, { onSuccess: () => onOpenChange(false) })
            }
            disabled={log.isPending}
          >
            {log.isPending ? 'Saving…' : 'Log activity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}