import { useRef, useState, FormEvent } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '@tanstack/react-store'
import { toast } from 'sonner'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Crown,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  User
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordStrength } from '@/components/ui/password-strength'
import {
  emailError,
  fullNameError,
  isValidEmail,
  isValidPassword,
  loginPasswordError,
  mobileError,
  organizationNameError,
  passwordError
} from '@/lib/validation'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'

type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>

type Phase = 'loading' | 'setup' | 'login'

const MOBILE_MAX = 10
const validators = {
  name: organizationNameError,
  mobileNumber: mobileError,
  ownerFullName: fullNameError,
  ownerEmail: (value: string) => emailError(value, 'Owner email is required'),
  ownerPassword: passwordError,
  loginEmail: (value: string) => emailError(value, 'Enter your email'),
  loginPassword: loginPasswordError
}

/** Per-field rule for when a value is complete enough to judge live (without blur/submit). */
const completeWhen = {
  name: (value: string) => value.trim().length > 0,
  mobileNumber: (value: string) => value.replace(/\D/g, '').length === MOBILE_MAX,
  ownerFullName: (value: string) => value.trim().length > 0,
  ownerEmail: isValidEmail,
  ownerPassword: isValidPassword,
  loginEmail: isValidEmail,
  loginPassword: (value: string) => value.length > 0
}

interface AuthGateProps {
  /** Boot-time identity status (owned by the app's identity queries). */
  status: 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED' | undefined
  /** True while the status query is still resolving on first load. */
  statusPending: boolean
  /** Called with the session once setup/login succeeds. */
  onAuthenticated: (session: SessionContext) => void
}

export function AuthGate({ status, statusPending, onAuthenticated }: AuthGateProps): React.JSX.Element {
  const [manualPhase, setManualPhase] = useState<'setup' | 'login' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const successTimer = useRef<number | null>(null)

  const setupForm = useForm({
    defaultValues: {
      name: '',
      mobileNumber: '',
      ownerFullName: '',
      ownerEmail: '',
      ownerPassword: ''
    },
    onSubmit: async ({ value }) => {
      setFormError(null)
      setSubmitSuccess(false)
      try {
        const session = await window.api.identity.setup(value)
        setSubmitSuccess(true)
        toast.success('Your workspace is ready', {
          description: `Welcome, ${session.userFullName}`
        })
        successTimer.current = window.setTimeout(() => onAuthenticated(session), 700)
      } catch (err) {
        setSubmitSuccess(false)
        setFormError(err instanceof Error ? err.message : 'Could not set up the organization.')
      }
    }
  })

  const loginForm = useForm({
    defaultValues: {
      email: '',
      password: ''
    },
    onSubmit: async ({ value }) => {
      setFormError(null)
      setSubmitSuccess(false)
      try {
        const session = await window.api.identity.login(value)
        setSubmitSuccess(true)
        toast.success('Signed in', {
          description: `Welcome back, ${session.userFullName}`
        })
        successTimer.current = window.setTimeout(() => onAuthenticated(session), 700)
      } catch (err) {
        setSubmitSuccess(false)
        setFormError(err instanceof Error ? err.message : 'Could not sign in.')
      }
    }
  })

  const setupSubmitting = useStore(setupForm.store, (s) => s.isSubmitting)
  const loginSubmitting = useStore(loginForm.store, (s) => s.isSubmitting)
  const setupSubmitted = useStore(setupForm.store, (s) => s.isSubmitted)
  const loginSubmitted = useStore(loginForm.store, (s) => s.isSubmitted)
  const setupValues = useStore(setupForm.store, (s) => s.values)
  const loginValues = useStore(loginForm.store, (s) => s.values)

  const debouncedName = useDebouncedValue(setupValues.name, 500)
  const orgReady =
    completeWhen.name(debouncedName) &&
    completeWhen.ownerEmail(setupValues.ownerEmail) &&
    completeWhen.mobileNumber(setupValues.mobileNumber)

  const existsQuery = useQuery({
    queryKey: [
      'identity',
      'organization-exists',
      {
        name: debouncedName,
        ownerEmail: setupValues.ownerEmail,
        mobileNumber: setupValues.mobileNumber
      }
    ],
    queryFn: () =>
      window.api.identity.checkOrganizationExists({
        name: debouncedName,
        ownerEmail: setupValues.ownerEmail,
        mobileNumber: setupValues.mobileNumber
      }),
    enabled: orgReady,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false
  })

  const existsError =
    existsQuery.isSuccess && existsQuery.data
      ? 'An organization with this name already exists'
      : null
  const checkingExists = existsQuery.isFetching

  const orgExists = status === 'LOGIN_REQUIRED'
  const phase: Phase =
    statusPending || status === undefined || status === 'AUTHENTICATED'
      ? 'loading'
      : (manualPhase ?? (status === 'SETUP_REQUIRED' ? 'setup' : 'login'))

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    e.stopPropagation()
    if (phase === 'setup') void setupForm.handleSubmit()
    else void loginForm.handleSubmit()
  }

  if (phase === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
        <div className="flex size-12 animate-pulse items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Crown className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">Checking your workspace…</p>
      </div>
    )
  }

  const isSetup = phase === 'setup'
  const submitted = isSetup ? setupSubmitted : loginSubmitted
  const submitting = isSetup ? setupSubmitting : loginSubmitting

  const setupValid =
    completeWhen.name(setupValues.name) &&
    !organizationNameError(setupValues.name) &&
    completeWhen.ownerFullName(setupValues.ownerFullName) &&
    !fullNameError(setupValues.ownerFullName) &&
    completeWhen.mobileNumber(setupValues.mobileNumber) &&
    !mobileError(setupValues.mobileNumber) &&
    completeWhen.ownerEmail(setupValues.ownerEmail) &&
    !emailError(setupValues.ownerEmail, 'Owner email is required') &&
    completeWhen.ownerPassword(setupValues.ownerPassword) &&
    !passwordError(setupValues.ownerPassword) &&
    !existsError &&
    !checkingExists

  const loginValid =
    completeWhen.loginEmail(loginValues.email) &&
    !emailError(loginValues.email, 'Enter your email') &&
    completeWhen.loginPassword(loginValues.password) &&
    !loginPasswordError(loginValues.password)

  const passwordEye = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — the identity moment, hidden until desktop */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to bottom, black, transparent 80%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 80%)'
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-primary-foreground ring-1 ring-white/20">
            <Crown className="size-5" />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">CrownCRM</span>
        </div>

        <div className="relative max-w-sm">
          <h2 className="font-heading text-4xl font-semibold leading-tight tracking-tight">
            The command center for your gym.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-primary-foreground/80">
            Members, plans, billing, and check-ins — all in one place, working even when you&apos;re
            offline.
          </p>
        </div>

        <p className="relative text-sm text-primary-foreground/70">
          Offline-first · Your data stays on this machine
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        {/* Mobile brand */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Crown className="size-5" />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">CrownCRM</span>
        </div>

        <div className="mx-auto w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {isSetup ? 'Set up your organization' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {isSetup
              ? 'Create the organization and its Owner account to get started.'
              : 'Sign in to continue to your workspace.'}
          </p>

          {formError ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              <span className="mt-0.5">•</span>
              <span>{formError}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-5">
            {isSetup ? (
              <>
                <setupForm.Field
                  name="name"
                  validators={{ onChange: ({ value }) => validators.name(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Organization name"
                      validate={validators.name}
                      completeWhen={completeWhen.name}
                      extraError={existsError}
                      leading={<Building2 className="pointer-events-none size-4" aria-hidden />}
                      placeholder="Your Gym"
                      autoComplete="organization"
                    />
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="mobileNumber"
                  validators={{ onChange: ({ value }) => validators.mobileNumber(value) }}
                >
                  {(field) => {
                    const remaining = MOBILE_MAX - field.state.value.length
                    return (
                      <AuthField
                        name={field.name}
                        state={field.state}
                        handleChange={field.handleChange}
                        handleBlur={field.handleBlur}
                        submitted={submitted}
                        label="Organization mobile number"
                        validate={validators.mobileNumber}
                        completeWhen={completeWhen.mobileNumber}
                        hint="Used for billing and contact."
                        leading={<Phone className="pointer-events-none size-4" aria-hidden />}
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="90000 00000"
                        onChange={(value) =>
                          field.handleChange(value.replace(/\D/g, '').slice(0, MOBILE_MAX))
                        }
                        trailing={
                          <span
                            className={cn(
                              'pointer-events-none text-xs tabular-nums',
                              remaining === 0
                                ? 'font-medium text-green-600 dark:text-green-400'
                                : remaining <= 3
                                  ? 'font-medium text-primary'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {remaining === 0 ? 'Complete' : `${remaining} characters remaining`}
                          </span>
                        }
                      />
                    )
                  }}
                </setupForm.Field>

                <setupForm.Field
                  name="ownerFullName"
                  validators={{ onChange: ({ value }) => validators.ownerFullName(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Owner full name"
                      validate={validators.ownerFullName}
                      completeWhen={completeWhen.ownerFullName}
                      leading={<User className="pointer-events-none size-4" aria-hidden />}
                      placeholder="Jane Doe"
                      autoComplete="name"
                    />
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="ownerEmail"
                  validators={{ onChange: ({ value }) => validators.ownerEmail(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Owner email"
                      validate={validators.ownerEmail}
                      completeWhen={completeWhen.ownerEmail}
                      leading={<Mail className="pointer-events-none size-4" aria-hidden />}
                      type="email"
                      autoComplete="email"
                      placeholder="jane@example.com"
                    />
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="ownerPassword"
                  validators={{ onChange: ({ value }) => validators.ownerPassword(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Password"
                      validate={validators.ownerPassword}
                      completeWhen={completeWhen.ownerPassword}
                      hint={
                        <div className="flex w-full flex-col gap-1">
                          <PasswordRequirement
                            met={isValidPassword(field.state.value)}
                            label="At least 8 characters"
                          />
                          <PasswordStrength value={field.state.value} />
                        </div>
                      }
                      leading={<LockKeyhole className="pointer-events-none size-4" aria-hidden />}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Enter a password"
                      trailing={passwordEye}
                    />
                  )}
                </setupForm.Field>
              </>
            ) : (
              <>
                <loginForm.Field
                  name="email"
                  validators={{ onChange: ({ value }) => validators.loginEmail(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Email"
                      validate={validators.loginEmail}
                      completeWhen={completeWhen.loginEmail}
                      leading={<Mail className="pointer-events-none size-4" aria-hidden />}
                      type="email"
                      autoComplete="email"
                      placeholder="jane@example.com"
                    />
                  )}
                </loginForm.Field>

                <loginForm.Field
                  name="password"
                  validators={{ onChange: ({ value }) => validators.loginPassword(value) }}
                >
                  {(field) => (
                    <AuthField
                      name={field.name}
                      state={field.state}
                      handleChange={field.handleChange}
                      handleBlur={field.handleBlur}
                      submitted={submitted}
                      label="Password"
                      validate={validators.loginPassword}
                      completeWhen={completeWhen.loginPassword}
                      leading={<LockKeyhole className="pointer-events-none size-4" aria-hidden />}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      trailing={passwordEye}
                    />
                  )}
                </loginForm.Field>
              </>
            )}

            <div className="mt-2 flex flex-col gap-2">
              <LoadingButton
                type="submit"
                loading={submitting}
                success={submitSuccess}
                disabled={isSetup ? !setupValid : !loginValid}
                loadingLabel={isSetup ? 'Creating…' : 'Signing in…'}
                successLabel={isSetup ? 'Created!' : 'Signed in!'}
                className="w-full"
                size="lg"
              >
                {isSetup ? 'Create organization' : 'Sign in'}
                <ArrowRight className="size-4" />
              </LoadingButton>
              <p aria-live="polite" className="sr-only">
                {submitSuccess
                  ? isSetup
                    ? 'Organization created. Taking you to your workspace.'
                    : 'Signed in. Taking you to your workspace.'
                  : ''}
              </p>
            </div>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isSetup ? (
              <>
                Already set up?{' '}
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setManualPhase('login')}
                >
                  Sign in
                </Button>
              </>
            ) : orgExists ? null : (
              <>
                Need a fresh start?{' '}
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setManualPhase('setup')}
                >
                  Set up this machine
                </Button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

interface FieldControl {
  name: string
  state: { value: string; meta: { isTouched: boolean } }
  handleChange: (value: string) => void
  handleBlur: () => void
}

interface AuthFieldProps extends FieldControl {
  submitted: boolean
  label: string
  hint?: React.ReactNode
  validate: (value: string) => string | undefined
  /**
   * Returns true once the value is complete enough to judge live (e.g. a 10-digit
   * mobile). When provided, the field evaluates on blur/submit OR as soon as this
   * returns true; when omitted it evaluates only on blur/submit.
   */
  completeWhen?: (value: string) => boolean
  leading?: React.ReactNode
  /** Node rendered as a trailing addon inside the input (e.g. counter, eye toggle). */
  trailing?: React.ReactNode
  type?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'url'
  inputClassName?: string
  onChange?: (value: string) => void
  showSuccessCheck?: boolean
  /**
   * An externally-computed error (e.g. the async "organization already exists"
   * check) shown in the same red style as a field error. When present the field
   * is treated as invalid regardless of its own validator result.
   */
  extraError?: string | null
}

/**
 * Thin shadcn-style wrapper that wires a TanStack field to a reactive `<Input>`:
 * `aria-invalid` / `data-valid` are set directly on the input based on
 * touched-or-submitted state, so the control visibly reflects error (red) and
 * success (green + check) states the moment the user interacts.
 */
function AuthField({
  name,
  state,
  handleChange,
  handleBlur,
  submitted,
  label,
  hint,
  validate,
  completeWhen,
  leading,
  trailing,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
  inputClassName,
  onChange,
  showSuccessCheck = true,
  extraError
}: AuthFieldProps): React.JSX.Element {
  const value = state.value
  const evaluated = state.meta.isTouched || submitted || Boolean(completeWhen?.(value))
  const errorMsg = validate(value)
  const hasExtra = Boolean(extraError)
  const invalid = (Boolean(errorMsg) || hasExtra) && (evaluated || hasExtra)
  const valid = !errorMsg && !hasExtra && evaluated
  const error = invalid ? (extraError ?? errorMsg) : undefined
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined

  return (
    <Field
      id={name}
      label={label}
      hint={hint}
      error={error}
      trailing={
        valid && showSuccessCheck ? (
          <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden />
        ) : undefined
      }
    >
      <InputGroup>
        {leading ? <InputGroupAddon align="start">{leading}</InputGroupAddon> : null}
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => (onChange ?? handleChange)(e.target.value)}
          onBlur={handleBlur}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={invalid || undefined}
          data-valid={valid || undefined}
          aria-describedby={describedBy}
          className={cn(inputClassName, leading ? 'pl-9' : '', trailing ? 'pr-10' : '')}
        />
        {trailing ? <InputGroupAddon align="end">{trailing}</InputGroupAddon> : null}
      </InputGroup>
    </Field>
  )
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs',
        met ? 'font-medium text-green-600 dark:text-green-400' : 'text-muted-foreground'
      )}
    >
      {met ? (
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Circle className="size-3.5 shrink-0" aria-hidden />
      )}
      {label}
    </span>
  )
}
