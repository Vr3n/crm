import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { NotebookPen } from 'lucide-react'
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
import { useBulkRecordActivity } from '../queries'
import { useReferenceData } from '../reference-data'

/**
 * Bulk activity logging for the selection toolbar: one activity per selected
 * lead, same type and note. Activities are history — immutable, timestamped
 * records of what happened. Types come from the org's reference vocabulary
 * (ownership changes are recorded by the assign flow, not here).
 */
export function BulkActivityDialog({
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
  const log = useBulkRecordActivity()
  const { data: ref } = useReferenceData()
  const types = useMemo(
    () => ref?.activityTypes.filter((t) => t.active && t.name !== 'OWNER_CHANGE') ?? [],
    [ref]
  )
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const form = useForm({
    defaultValues: { typeId: types[0]?.id ?? 0, note: '' },
    onSubmit: async ({ value }) => {
      try {
        await log.mutateAsync({
          leadIds,
          typeId: value.typeId,
          note: value.note.trim(),
          occurredAt: new Date().toISOString()
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
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-primary" />
            Log activities · {count} {count === 1 ? 'lead' : 'leads'}
          </DialogTitle>
          <DialogDescription>
            One activity is recorded for each selected lead, with the same type and note. History is
            never edited.
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
              name="typeId"
              validators={{
                onChange: ({ value }) => (value > 0 ? undefined : 'Choose a type')
              }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={{
                    value: field.state.value > 0 ? String(field.state.value) : '',
                    meta: field.state.meta
                  }}
                  handleChange={(v) => field.handleChange(Number(v))}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label={
                    <>
                      Type <span className="text-destructive">*</span>
                    </>
                  }
                  validate={(v) => (v ? undefined : 'Choose a type')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy }) => (
                    <Select
                      value={value}
                      onValueChange={(v) => {
                        if (v !== '') field.handleChange(Number(v))
                      }}
                      disabled={types.length === 0}
                    >
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      >
                        <SelectValue
                          placeholder={
                            types.length === 0 ? 'No activity types configured' : 'Choose a type'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((t) => (
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

            <form.Field name="note">
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
          </FieldGroup>

          <DialogFooter className="mt-6">
            <LoadingButton type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit}
              loadingLabel="Saving…"
              successLabel="Logged!"
            >
              Log activities
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
