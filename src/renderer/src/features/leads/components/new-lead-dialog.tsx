import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import { Mail, Phone, User, UserPlus } from 'lucide-react'
import { AutocorrectCombobox, type AutocorrectOption } from '@/components/autocorrect-combobox'
import { Button } from '@/components/ui/button'
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
import { can, useSession } from '@/context/session-context'
import { logger } from '@/lib/logger'
import { emailError, isValidEmail, leadNameError, mobileError } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { isApiError } from '../../../../../shared/contracts/errors'
import { api } from '../api'
import { useCreateLead } from '../queries'
import { referenceKeys } from '../reference-data'

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
  const session = useSession()
  const queryClient = useQueryClient()

  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  // The dialog remounts per open (LeadsPage mounts it conditionally). The source
  // field is empty on mount — the combobox searches the backend live, so there is
  // nothing to seed from reference data here.
  const form = useForm({
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      source: '',
      plan: '',
      goal: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      const sourceId = value.source ? Number(value.source) : undefined
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

  const submitted = useStore(form.store, (s) => s.isSubmitted)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  // Before the user picks a source the onChange validator has not run yet, so
  // `canSubmit` can be spuriously true — keep submit gated on an actual value.
  const sourceValue = useStore(form.store, (s) => s.values.source)
  const formError = create.error
    ? isApiError(create.error)
      ? create.error.message
      : 'Could not create lead'
    : null

  // Creating a source is a settings action; searching sources is visible to
  // anyone who can view leads (mirrors `requirePermission` in the backend).
  const canCreateSource = can(session.permissions, session.isSuper, 'settings.manage')

  const searchSources = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    const rows = await api.searchSources(query)
    return rows.map((row) => ({ id: String(row.id), label: row.name }))
  }, [])

  const createSource = useCallback(async (label: string): Promise<AutocorrectOption<string>> => {
    const row = await api.createSource({ name: label })
    return { id: String(row.id), label: row.name }
  }, [])

  const searchPlanInterests = useCallback(
    async (query: string): Promise<AutocorrectOption<string>[]> => {
      try {
        const rows = await api.searchPlanInterests(query)
        logger.debug('searchPlanInterests', { query, count: rows.length, rows })
        return rows.map((row) => ({ id: row.id, label: row.label }))
      } catch (error) {
        logger.warn('searchPlanInterests failed', { query, error })
        throw error
      }
    },
    []
  )

  const searchGoals = useCallback(async (query: string): Promise<AutocorrectOption<string>[]> => {
    try {
      const rows = await api.searchGoals(query)
      logger.debug('searchGoals', { query, count: rows.length, rows })
      return rows.map((row) => ({ id: row.id, label: row.label }))
    } catch (error) {
      logger.warn('searchGoals failed', { query, error })
      throw error
    }
  }, [])

  // Plan interest / goal are free-text fields: the typed text is the identity, so
  // "creating" an option just commits the text — there is no vocabulary row to
  // persist, unlike sources.
  const createFreeTextOption = useCallback(
    async (label: string): Promise<AutocorrectOption<string>> => ({ id: label, label }),
    []
  )

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
            <form.Field name="name" validators={{ onChange: ({ value }) => leadNameError(value) }}>
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
              <form.Field name="phone" validators={{ onChange: ({ value }) => mobileError(value) }}>
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
                        return (
                          digits.length > 0 &&
                          (!/^[026-9]/.test(digits) || digits.length === PHONE_MAX)
                        )
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
                <AutocorrectCombobox
                  field={{
                    name: field.name,
                    state: field.state,
                    // react-form's source value is a string; the combobox clears
                    // with `null`, so translate that back to the empty string.
                    handleChange: (value: string | null) => field.handleChange(value ?? ''),
                    handleBlur: field.handleBlur
                  }}
                  search={searchSources}
                  create={createSource}
                  label={
                    <>
                      Source <span className="text-destructive">*</span>
                    </>
                  }
                  description="Search an existing source or add a new one"
                  placeholder="Where did they come from?"
                  searchPlaceholder="Search or add a source…"
                  minSearchLength={2}
                  canCreate={canCreateSource}
                  onCreated={() =>
                    void queryClient.invalidateQueries({ queryKey: referenceKeys.all })
                  }
                />
              )}
            </form.Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <form.Field name="plan">
                {(field) => (
                  <AutocorrectCombobox
                    field={{
                      name: field.name,
                      state: field.state,
                      handleChange: (value: string | null) => field.handleChange(value ?? ''),
                      handleBlur: field.handleBlur
                    }}
                    search={searchPlanInterests}
                    create={createFreeTextOption}
                    label="Plan interest"
                    description="Pick an existing interest or add a new one"
                    placeholder="e.g. Annual Premium"
                    searchPlaceholder="Search or add a plan interest…"
                    minSearchLength={2}
                  />
                )}
              </form.Field>

              <form.Field name="goal">
                {(field) => (
                  <AutocorrectCombobox
                    field={{
                      name: field.name,
                      state: field.state,
                      handleChange: (value: string | null) => field.handleChange(value ?? ''),
                      handleBlur: field.handleBlur
                    }}
                    search={searchGoals}
                    create={createFreeTextOption}
                    label="Goal"
                    description="Pick an existing goal or add a new one"
                    placeholder="e.g. Weight loss"
                    searchPlaceholder="Search or add a goal…"
                    minSearchLength={2}
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
