import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { BellPlus } from 'lucide-react'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { FormField } from '@/components/ui/form-field'
import { LoadingButton } from '@/components/ui/loading-button'
import { useBulkScheduleFollowUp } from '../queries'

/**
 * Bulk follow-up for the selection toolbar: one follow-up per selected lead,
 * with the same title and due time. "Follow-up = future work" — the due time
 * is always set and the backend rejects past dates.
 */
export function BulkFollowUpDialog({
  open,
  onOpenChange,
  count,
  leadIds,
  onSuccess
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  count: number
  leadIds: number[]
  onSuccess: () => void
}): React.JSX.Element {
  const schedule = useBulkScheduleFollowUp()
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { title: '', due: '' },
    onSubmit: async ({ value }) => {
      try {
        await schedule.mutateAsync({
          leadIds,
          title: value.title.trim(),
          dueAt: new Date(value.due).toISOString()
        })
        onSuccess()
        setSubmitSuccess(true)
        window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellPlus className="size-4 text-primary" />
            Schedule follow-ups · {count} {count === 1 ? 'lead' : 'leads'}
          </DialogTitle>
          <DialogDescription>
            One follow-up is created for each selected lead, with the same title
            and due time.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value.trim().length > 0 ? undefined : 'Give this follow-up a name'
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      What to do <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) =>
                    v.trim().length > 0 ? undefined : 'Give this follow-up a name'
                  }
                  completeWhen={(v) => v.trim().length > 0}
                  placeholder="e.g. Call to confirm trial"
                />
              )}
            </form.Field>

            <form.Field
              name="due"
              validators={{
                onChange: ({ value }) => (value ? undefined : 'Pick a due date and time')
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      Due <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v ? undefined : 'Pick a due date and time')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, describedBy, onChange }) => (
                    <DateTimePicker
                      id={id}
                      value={value}
                      invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(iso) => onChange(iso)}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit}
              loadingLabel="Scheduling…"
              successLabel="Scheduled!"
            >
              Schedule
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}