import { useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { PhoneCall } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
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
import { useLogActivity } from '../queries'
import { useReferenceData } from '../reference-data'
import { LeadPicker } from './lead-picker'
import type { Lead } from '../types'

/**
 * Log an activity (Module 01 §24). Activities are history — immutable,
 * timestamped records of what happened. Types come from the org's reference
 * vocabulary (ownership changes are recorded by the assign flow, not here).
 * From the global Activities page the lead is picked first; from the lead
 * detail it is already known.
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
  const { data: ref } = useReferenceData()
  const types = useMemo(
    () => ref?.activityTypes.filter((t) => t.active && t.name !== 'OWNER_CHANGE') ?? [],
    [ref]
  )
  const [picked, setPicked] = useState<Lead | null>(lead ?? null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const target = picked ?? lead ?? null

  const form = useForm({
    defaultValues: { typeId: types[0]?.id ?? 0, note: '' },
    onSubmit: async ({ value }) => {
      if (!target) return
      try {
        await log.mutateAsync({
          leadId: target.id,
          typeId: value.typeId,
          note: value.note.trim(),
          occurredAt: new Date().toISOString()
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
  const canSubmit = useStore(form.store, (s) => s.canSubmit)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
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
          <FieldGroup className="gap-4">
            {!lead ? (
              <Field label="For whom">
                <LeadPicker value={target?.id ?? 0} onChange={setPicked} invalid={!target} />
              </Field>
            ) : null}

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
              disabled={!canSubmit || !target}
              loadingLabel="Saving…"
              successLabel="Logged!"
            >
              Log activity
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
