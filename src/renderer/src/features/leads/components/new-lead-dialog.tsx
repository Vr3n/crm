import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Mail, Phone, Tag, Target, User, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { emailError, isValidEmail, leadNameError, mobileError } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { isApiError } from '../../../../../shared/contracts/errors'
import { useCreateLead } from '../queries'
import { useReferenceData } from '../reference-data'

const PHONE_MAX = 10

/**
 * Fast "New lead" capture (staff aren't tech-savvy): a single modal with only
 * the fields a front-desk person actually has at that moment. Name and phone
 * are required — the backend enforces an Indian mobile or landline format and
 * dedupes by phone, so an existing person never becomes a second lead. Fields
 * react live (red on error, green once complete) exactly like the auth forms;
 * the phone shows a live digit counter and flags a wrong starting digit the
 * moment it is typed.
 */
export function NewLeadDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}): React.JSX.Element {
  const create = useCreateLead()
  const { data: ref } = useReferenceData()
  const sources = useMemo(() => ref?.sources.filter((s) => s.active) ?? [], [ref])

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  // The dialog remounts per open (LeadsPage mounts it conditionally), so the
  // first active source is seeded directly into the form's initial state when
  // the reference vocabulary is already cached — the value is visible on the
  // very first paint. If the vocabulary is still loading on this mount the
  // `source` value stays '' and the effect below fills it once data arrives.
  const form = useForm({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      source: sources[0] ? String(sources[0].id) : '',
      plan: '',
      goal: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      const sourceId = value.source ? Number(value.source) : sources[0]?.id
      if (sourceId === undefined) return
      try {
        await create.mutateAsync({
          fullName: value.name.trim(),
          phone: value.phone.trim(),
          email: value.email.trim() || undefined,
          sourceId,
          planInterest: value.plan.trim() || undefined,
          goal: value.goal.trim() || undefined,
          notes: value.notes.trim() || undefined
        })
        setSubmitSuccess(true)
        successTimer.current = window.setTimeout(() => onOpenChange(false), 700)
      } catch {
        setSubmitSuccess(false)
      }
    }
  })

  // Fallback seed for the cold path: the dialog opened before the reference
  // vocabulary resolved, so `defaultValues.source` was still ''. The guard
  // keeps a real user pick — never overwrite a non-empty value.
  useEffect(() => {
    if (sources.length > 0 && form.state.values.source === '') {
      form.setFieldValue('source', String(sources[0].id))
    }
  }, [sources, form])

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  // Before the reference data loads (and the seed below fills it), the source
  // field's validator has not run yet, so `canSubmit` can be spuriously true —
  // keep submit gated on an actual source value.
  const sourceValue = useStore(form.store, (s) => s.values.source)
  const formError = create.error
    ? isApiError(create.error)
      ? create.error.message
      : 'Could not create lead'
    : null

  useEffect(() => {
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            New lead
          </DialogTitle>
          <DialogDescription>
            Capture an enquiry in under a minute. Name and phone are required.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          {formError ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              <span className="mt-0.5">•</span>
              <span>{formError}</span>
            </div>
          ) : null}

          <FieldGroup className="gap-3">
            <form.Field
              name="name"
              validators={{ onChange: ({ value }) => leadNameError(value) }}
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
                      Name <span className="text-destructive">*</span>
                    </>
                  }
                  validate={leadNameError}
                  completeWhen={(v) => v.trim().length > 0}
                  leading={<User className="pointer-events-none size-4" aria-hidden />}
                  placeholder="Full name"
                  autoComplete="name"
                />
              )}
            </form.Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field
                name="phone"
                validators={{ onChange: ({ value }) => mobileError(value) }}
              >
                {(field) => {
                  const remaining = PHONE_MAX - field.state.value.length
                  return (
                    <FormField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label={
                        <>
                          Phone <span className="text-destructive">*</span>
                        </>
                      }
                      labelEnd={
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            remaining === 0
                              ? 'font-medium text-green-600 dark:text-green-400'
                              : remaining <= 3
                                ? 'font-medium text-primary'
                                : 'text-muted-foreground'
                          )}
                        >
                          {remaining === 0 ? 'Complete' : `${remaining} digits remaining`}
                        </span>
                      }
                      hint="10-digit mobile or landline"
                      validate={mobileError}
                      completeWhen={(v) => {
                        const digits = v.replace(/\D/g, '')
                        // Judge the field the moment the number is clearly
                        // invalid (a wrong starting digit) or once all 10
                        // digits are in — never nag about an incomplete
                        // length while typing.
                        return digits.length > 0 && (!/^[026-9]/.test(digits) || digits.length === PHONE_MAX)
                      }}
                      leading={<Phone className="pointer-events-none size-4" aria-hidden />}
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder="90000 00000"
                      onChange={(value) =>
                        field.handleChange(value.replace(/\D/g, '').slice(0, PHONE_MAX))
                      }
                    />
                  )
                }}
              </form.Field>

              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) =>
                    value.trim() ? emailError(value, 'Enter a valid email') : undefined
                }}
              >
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Email"
                    validate={(v) => (v.trim() ? emailError(v, 'Enter a valid email') : undefined)}
                    completeWhen={isValidEmail}
                    leading={<Mail className="pointer-events-none size-4" aria-hidden />}
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                  />
                )}
              </form.Field>
            </div>

            <form.Field
              name="source"
              validators={{ onChange: ({ value }) => (value ? undefined : 'Choose a source') }}
            >
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Source"
                  validate={(v) => (v ? undefined : 'Choose a source')}
                  completeWhen={(v) => Boolean(v)}
                >
                  {({ id, value, invalid, valid, describedBy, onChange }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id={id}
                        aria-invalid={invalid}
                        data-valid={valid}
                        aria-describedby={describedBy}
                      >
                        <SelectValue placeholder="Where did they come from?" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              )}
            </form.Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field name="plan">
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Plan interest"
                    validate={() => undefined}
                    completeWhen={(v) => v.trim().length > 0}
                    leading={<Tag className="pointer-events-none size-4" aria-hidden />}
                    placeholder="e.g. Annual Premium"
                  />
                )}
              </form.Field>

              <form.Field name="goal">
                {(field) => (
                  <FormField
                    name={field.name}
                    state={field.state}
                    handleChange={field.handleChange}
                    handleBlur={field.handleBlur}
                    submitted={submitted}
                    label="Goal"
                    validate={() => undefined}
                    completeWhen={(v) => v.trim().length > 0}
                    leading={<Target className="pointer-events-none size-4" aria-hidden />}
                    placeholder="e.g. Weight loss"
                  />
                )}
              </form.Field>
            </div>

            <form.Field name="notes">
              {(field) => (
                <FormField
                  name={field.name}
                  state={field.state}
                  handleChange={field.handleChange}
                  handleBlur={field.handleBlur}
                  submitted={submitted}
                  label="Notes"
                  hint="Anything worth remembering"
                  validate={() => undefined}
                  completeWhen={(v) => v.trim().length > 0}
                >
                  {({ id, value, invalid, valid, describedBy, onBlur, onChange }) => (
                    <Textarea
                      id={id}
                      value={value}
                      onBlur={onBlur}
                      onChange={(e) => onChange(e.target.value)}
                      rows={2}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              success={submitSuccess}
              disabled={!canSubmit || sourceValue === ''}
              loadingLabel="Creating…"
              successLabel="Created!"
            >
              Create lead
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}