import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { PhoneCall } from 'lucide-react'
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
import { LeadPicker } from './lead-picker'
import type { ActivityTypeKey, Lead } from '../types'

const TYPES = Object.keys(ACTIVITY_LABELS).filter((t) => !t.includes('LEAD_CREATED'))

/**
 * Log an activity (Module 01 §24). Activities are history — immutable,
 * timestamped records of what happened. From the global Activities page the
 * lead is picked first; from the lead detail it is already known.
 */
export function LogActivityDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead?: Lead
}): React.JSX.Element {
  const log = useLogActivity()
  const [picked, setPicked] = useState<Lead | null>(lead ?? null)
  const target = picked ?? lead ?? null

  const form = useForm({
    defaultValues: { type: 'PHONE_CALL' as ActivityTypeKey, note: '' },
    onSubmit: async ({ value }) => {
      if (!target) return
      try {
        await log.mutateAsync({ id: target.id, type: value.type, note: value.note.trim() })
        onOpenChange(false)
      } catch {
        // error toast handled by the mutation hook
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="size-4 text-primary" />
            {lead ? `Log an activity · ${lead.name}` : 'Log an activity'}
          </DialogTitle>
          <DialogDescription>
            {lead
              ? 'Record what happened. Activities are history — they are never edited.'
              : 'Pick who it happened with, then record the touchpoint. History is never edited.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="grid gap-3">
            {!lead ? (
              <div className="grid gap-1.5">
                <Label>For whom</Label>
                <LeadPicker value={target?.id ?? ''} onChange={setPicked} />
              </div>
            ) : null}

            <form.Field name="type">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor="act-type">Type</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => field.handleChange(v as ActivityTypeKey)}
                  >
                    <SelectTrigger id="act-type">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACTIVITY_LABELS[t as ActivityTypeKey]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            <form.Field name="note">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor="act-note">Note</Label>
                  <Textarea
                    id="act-note"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="What happened on this touchpoint?"
                    rows={3}
                  />
                </div>
              )}
            </form.Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <form.Subscribe
              selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || !target}>
                  {isSubmitting ? 'Saving…' : 'Log activity'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
