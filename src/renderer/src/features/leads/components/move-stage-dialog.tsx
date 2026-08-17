import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StageBadge } from './stage-badge'
import { forwardStages } from '../constants'
import { useAddFollowUp, useMoveStage } from '../queries'
import type { Lead, StageKey } from '../types'

/**
 * Strict stage move (Module 01 robustness rule): a lead can never silently
 * change stage on the board/table — every move requires an activity note, and
 * optionally schedules the next follow-up in the same breath. Moves to WON/LOST
 * are handled by their dedicated (reason-requiring) dialogs instead.
 */
export function MoveStageDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead: Lead
}): React.JSX.Element {
  const move = useMoveStage()
  const addFollowUp = useAddFollowUp()
  const options = useMemo(() => forwardStages(lead.stage), [lead.stage])
  const [to, setTo] = useState<StageKey | undefined>(options[0]?.key)
  const [note, setNote] = useState('')
  const [schedule, setSchedule] = useState(false)
  const [fuTitle, setFuTitle] = useState('')
  const [due, setDue] = useState('')

  const submitting = move.isPending || addFollowUp.isPending

  function submit(): void {
    if (!to) return
    const next = (): void => {
      if (schedule && fuTitle.trim() && due) {
        addFollowUp.mutate({
          id: lead.id,
          title: fuTitle,
          dueAt: new Date(due).toISOString()
        })
      }
    }
    move.mutate(
      { id: lead.id, to, note: note.trim() },
      { onSuccess: () => { next(); onOpenChange(false) } }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {lead.name}</DialogTitle>
          <DialogDescription>
            Log what moved this lead forward. Every stage change keeps a reason
            so the history stays true.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <StageBadge stage={lead.stage} />
          <ArrowRight className="size-4 text-muted-foreground" />
          {to ? <StageBadge stage={to} /> : <span className="text-muted-foreground">—</span>}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="move-stage">Move to</Label>
            <Select value={to} onValueChange={(v) => setTo(v as StageKey)}>
              <SelectTrigger id="move-stage">
                <SelectValue placeholder="Choose a stage" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="move-note">
              What happened? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="move-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Spoke with him, he wants a family plan"
              rows={3}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={schedule}
                onChange={(e) => setSchedule(e.target.checked)}
              />
              Also schedule the next follow-up
            </Label>
            {schedule && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={fuTitle}
                  onChange={(e) => setFuTitle(e.target.value)}
                  placeholder="e.g. Call to close"
                />
                <Input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !to || !note.trim()}>
            {submitting ? 'Moving…' : 'Move stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}