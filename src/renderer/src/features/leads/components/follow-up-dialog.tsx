import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { BellPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/date-time-picker'
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
import { LeadPicker } from './lead-picker'
import type { Lead } from '../types'

/**
 * Schedule a follow-up (Module 01 §25). From the lead detail screen the lead is
 * already known; from the global Follow-ups page it is chosen first via the
 * searchable LeadPicker. "Follow-up = future work" — always has a due time.
 */
export function FollowUpDialog({
  open,
  onOpenChange,
  lead
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lead?: Lead
}): React.JSX.Element {
  const add = useAddFollowUp()
  const [picked, setPicked] = useState<Lead | null>(lead ?? null)
  const target = picked ?? lead ?? null

  const form = useForm({
    defaultValues: { title: '', due: '', note: '' },
    onSubmit: async ({ value }) => {
      if (!target) return
      try {
        await add.mutateAsync({
          id: target.id,
          title: value.title,
          dueAt: value.due,
          note: value.note.trim() || undefined
        })
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
            <BellPlus className="size-4 text-primary" />
            {lead ? `Schedule a follow-up · ${lead.name}` : 'Schedule a follow-up'}
          </DialogTitle>
          <DialogDescription>
            {lead
              ? 'A future action you intend to take with this lead.'
              : 'Pick who it is for, then set the action and when it should happen.'}
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

            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Give this follow-up a name'
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`fu-${field.name}`}>
                    What to do <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`fu-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g. Call to confirm trial"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field
              name="due"
              validators={{
                onChange: ({ value }) => (value ? undefined : 'Pick a due date and time')
              }}
            >
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`fu-${field.name}`}>
                    Due <span className="text-destructive">*</span>
                  </Label>
                  <DateTimePicker
                    value={field.state.value}
                    onChange={(iso) => field.handleChange(iso)}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 ? (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="note">
              {(field) => (
                <div className="grid gap-1.5">
                  <Label htmlFor={`fu-${field.name}`}>Note</Label>
                  <Textarea
                    id={`fu-${field.name}`}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Optional context"
                    rows={2}
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
                  {isSubmitting ? 'Scheduling…' : 'Schedule'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
