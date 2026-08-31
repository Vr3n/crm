import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { CheckCircle2, ChevronDown, PhoneCall } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCompleteFollowUp } from '@/features/leads/queries'
import { useReferenceData } from '@/features/leads/reference-data'
import type { FollowUpRow } from '../types'

/**
 * Mark a follow-up done with optional completion notes and optional activity
 * logging. Notes are optional — the backend stores them against the follow-up
 * and the lead detail timeline surfaces them. The activity section lets staff
 * record what happened during this follow-up touchpoint, just like when
 * creating a new lead.
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
  const { data: ref } = useReferenceData()
  const activityTypes = useMemo(
    () => ref?.activityTypes.filter((t) => t.active && t.name !== 'OWNER_CHANGE') ?? [],
    [ref]
  )
  const [activityOpen, setActivityOpen] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: {
      notes: '',
      activityTypeId: String(activityTypes[0]?.id ?? ''),
      activityNote: ''
    },
    onSubmit: async ({ value }) => {
      try {
        await complete.mutateAsync({
          followupId: followUp.id,
          notes: value.notes.trim() || undefined,
          activity:
            activityOpen && value.activityTypeId
              ? {
                  typeId: Number(value.activityTypeId),
                  note: value.activityNote.trim() || undefined
                }
              : undefined
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

            {/* Activity section */}
            <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                    activityOpen && 'bg-muted/50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <PhoneCall className="size-4 text-primary" />
                    Log an activity
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      activityOpen && 'rotate-180'
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <form.Field
                  name="activityTypeId"
                  validators={{
                    onChange: ({ value }) =>
                      activityOpen && !value ? 'Choose a type' : undefined
                  }}
                >
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={{
                        value: field.state.value,
                        meta: field.state.meta
                      }}
                      handleChange={(v) => field.handleChange(v)}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Type"
                      validate={(v) => (v ? undefined : 'Choose a type')}
                      completeWhen={(v) => Boolean(v)}
                    >
                      {({ id, value, invalid, valid, describedBy }) => (
                        <Select
                          value={value}
                          onValueChange={(v) => {
                            if (v !== '') field.handleChange(v)
                          }}
                          disabled={activityTypes.length === 0}
                        >
                          <SelectTrigger
                            id={id}
                            aria-invalid={invalid}
                            data-valid={valid}
                            aria-describedby={describedBy}
                          >
                            <SelectValue
                              placeholder={
                                activityTypes.length === 0
                                  ? 'No activity types configured'
                                  : 'Choose a type'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {activityTypes.map((t) => (
                              <SelectItem key={t.id} value={String(t.id)}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                  )}
                </form.Field>

                <form.Field name="activityNote">
                  {(field) => (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Note"
                      hint="What happened on this touchpoint?"
                      validate={() => undefined}
                      completeWhen={(v) => v.trim().length > 0}
                    >
                      {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                        <Textarea
                          id={id}
                          value={value}
                          onBlur={onBlur}
                          onChange={(e) => onChange(e.target.value)}
                          placeholder="What happened on this touchpoint?"
                          rows={3}
                          aria-invalid={invalid}
                          data-valid={valid}
                          aria-describedby={describedBy}
                        />
                      )}
                    </FormField>
                  )}
                </form.Field>
              </CollapsibleContent>
            </Collapsible>
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
