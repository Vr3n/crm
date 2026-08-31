import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { CheckCircle2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useCompleteFollowUp } from '@/features/leads/queries'
import type { FollowUpRow } from '../types'

/**
 * Mark a follow-up done with optional completion notes. Notes are optional —
 * the backend stores them against the follow-up and the lead detail timeline
 * surfaces them.
 */
export function CompleteFollowUpDialog({
  open,
  onOpenChange,
  followUp
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  followUp: FollowUpRow
}): React.JSX.Element {
  const complete = useCompleteFollowUp()
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { notes: '' },
    onSubmit: async ({ value }) => {
      try {
        await complete.mutateAsync({
          followupId: followUp.id,
          notes: value.notes.trim() || undefined
        })
        setSubmitSuccess(true)
        window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            Mark follow-up done
          </DialogTitle>
          <DialogDescription>
            &ldquo;{followUp.title}&rdquo; for {followUp.leadName}. Add a note about the outcome
            (optional).
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
            <form.Field name="notes">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Completion notes"
                  validate={() => undefined}
                >
                  {({ id, value, invalid, describedBy, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      aria-invalid={invalid}
                      aria-describedby={describedBy}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="e.g. Spoke with them — they'll decide by Friday"
                      rows={3}
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
              loadingLabel="Completing…"
              successLabel="Done!"
            >
              Mark done
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
