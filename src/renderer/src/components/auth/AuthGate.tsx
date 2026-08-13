import { useEffect, useState, FormEvent } from 'react'
import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { ArrowRight, Crown, Eye, EyeOff, LockKeyhole, Mail, Phone, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { LoadingButton } from '@/components/ui/loading-button'
import { isValidIndianMobile, isValidEmail, isValidPassword } from '@/lib/validation'
import { cn } from '@/lib/utils'

type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>

type AuthStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'
type Phase = 'loading' | 'setup' | 'login'

const MOBILE_MAX = 10

interface AuthGateProps {
  onAuthenticated: (session: SessionContext) => void
}

export function AuthGate({ onAuthenticated }: AuthGateProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.identity.status().then((status: AuthStatus) => {
      if (cancelled) return
      if (status === 'AUTHENTICATED') {
        window.api.identity.session().then((session) => {
          if (!cancelled && session) onAuthenticated(session)
        })
        return
      }
      setPhase(status === 'SETUP_REQUIRED' ? 'setup' : 'login')
    })
    return () => {
      cancelled = true
    }
  }, [onAuthenticated])

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
      try {
        onAuthenticated(await window.api.identity.setup(value))
      } catch (err) {
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
      try {
        onAuthenticated(await window.api.identity.login(value))
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Could not sign in.')
      }
    }
  })

  // Fine-grained subscriptions to drive the button and field-error visibility.
  const setupSubmitting = useStore(setupForm.store, (s) => s.isSubmitting)
  const loginSubmitting = useStore(loginForm.store, (s) => s.isSubmitting)
  const setupSubmitted = useStore(setupForm.store, (s) => s.isSubmitted)
  const loginSubmitted = useStore(loginForm.store, (s) => s.isSubmitted)

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
                  validators={{
                    onChange: ({ value }) =>
                      !value.trim() ? 'Organization name is required' : undefined
                  }}
                >
                  {(field) => (
                    <Field
                      id={field.name}
                      label="Organization name"
                      error={
                        field.state.meta.errors.length > 0 &&
                        (field.state.meta.isTouched || submitted)
                          ? field.state.meta.errors[0]
                          : undefined
                      }
                    >
                      <Input
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        placeholder="Your Gym"
                        autoComplete="organization"
                      />
                    </Field>
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="mobileNumber"
                  validators={{
                    onChange: ({ value }) =>
                      isValidIndianMobile(value) ? undefined : 'Enter a valid 10-digit number'
                  }}
                >
                  {(field) => {
                    const remaining = MOBILE_MAX - field.state.value.length
                    return (
                      <Field
                        id={field.name}
                        label="Organization mobile number"
                        error={
                          field.state.meta.errors.length > 0 &&
                          (field.state.meta.isTouched || submitted)
                            ? field.state.meta.errors[0]
                            : undefined
                        }
                        hint="Used for billing and contact."
                        trailing={
                          <span
                            className={cn(
                              'text-xs tabular-nums',
                              remaining === 0
                                ? 'font-medium text-emerald-600'
                                : remaining <= 3
                                  ? 'font-medium text-primary'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {remaining === 0 ? 'Complete' : `${remaining} characters remaining`}
                          </span>
                        }
                      >
                        <div className="relative">
                          <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={field.state.value}
                            onChange={(e) =>
                              field.handleChange(
                                e.target.value.replace(/\D/g, '').slice(0, MOBILE_MAX)
                              )
                            }
                            onBlur={field.handleBlur}
                            type="tel"
                            autoComplete="tel"
                            placeholder="90000 00000"
                            inputMode="tel"
                            className="pl-9"
                          />
                        </div>
                      </Field>
                    )
                  }}
                </setupForm.Field>

                <setupForm.Field
                  name="ownerFullName"
                  validators={{
                    onChange: ({ value }) =>
                      !value.trim() ? 'Owner full name is required' : undefined
                  }}
                >
                  {(field) => (
                    <Field
                      id={field.name}
                      label="Owner full name"
                      error={
                        field.state.meta.errors.length > 0 &&
                        (field.state.meta.isTouched || submitted)
                          ? field.state.meta.errors[0]
                          : undefined
                      }
                    >
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          autoComplete="name"
                          className="pl-9"
                        />
                      </div>
                    </Field>
                  )}
                </setupForm.Field>

                <setupForm.Field
                  name="ownerEmail"
                  validators={{
                    onChange: ({ value }) =>
                      isValidEmail(value) ? undefined : 'Enter a valid email address'
                  }}
                >
                  {(field) => (
                    <Field
                      id={field.name}
                      label="Owner email"
                      error={
                        field.state.meta.errors.length > 0 &&
                        (field.state.meta.isTouched || submitted)
                          ? field.state.meta.errors[0]
                          : undefined
                      }
                    >
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          type="email"
                          autoComplete="email"
                          className="pl-9"
                        />
                      </div>
                    </Field>
                  )}
                </setupForm.Field>
              </>
            ) : (
              <>
                <loginForm.Field
                  name="email"
                  validators={{
                    onChange: ({ value }) =>
                      isValidEmail(value) ? undefined : 'Enter a valid email address'
                  }}
                >
                  {(field) => (
                    <Field
                      id={field.name}
                      label="Email"
                      error={
                        field.state.meta.errors.length > 0 &&
                        (field.state.meta.isTouched || submitted)
                          ? field.state.meta.errors[0]
                          : undefined
                      }
                    >
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          type="email"
                          autoComplete="email"
                          className="pl-9"
                        />
                      </div>
                    </Field>
                  )}
                </loginForm.Field>
              </>
            )}

            {isSetup ? (
              <setupForm.Field
                name="ownerPassword"
                validators={{
                  onChange: ({ value }) =>
                    isValidPassword(value) ? undefined : 'Password must be at least 8 characters'
                }}
              >
                {(field) => (
                  <Field
                    id={field.name}
                    label="Password"
                    error={
                      field.state.meta.errors.length > 0 &&
                      (field.state.meta.isTouched || submitted)
                        ? field.state.meta.errors[0]
                        : undefined
                    }
                    hint="At least 8 characters."
                  >
                    <PasswordInput
                      value={field.state.value}
                      onChange={(v) => field.handleChange(v)}
                      onBlur={field.handleBlur}
                      showPassword={showPassword}
                      onTogglePassword={() => setShowPassword((v) => !v)}
                      autoComplete="new-password"
                    />
                  </Field>
                )}
              </setupForm.Field>
            ) : (
              <loginForm.Field
                name="password"
                validators={{
                  onChange: ({ value }) => (!value ? 'Password is required' : undefined)
                }}
              >
                {(field) => (
                  <Field
                    id={field.name}
                    label="Password"
                    error={
                      field.state.meta.errors.length > 0 &&
                      (field.state.meta.isTouched || submitted)
                        ? field.state.meta.errors[0]
                        : undefined
                    }
                  >
                    <PasswordInput
                      value={field.state.value}
                      onChange={(v) => field.handleChange(v)}
                      onBlur={field.handleBlur}
                      showPassword={showPassword}
                      onTogglePassword={() => setShowPassword((v) => !v)}
                      autoComplete="current-password"
                    />
                  </Field>
                )}
              </loginForm.Field>
            )}

            <div className="mt-2">
              <LoadingButton
                type="submit"
                loading={submitting}
                loadingLabel={isSetup ? 'Creating…' : 'Signing in…'}
                className="w-full"
                size="lg"
              >
                {isSetup ? 'Create organization' : 'Sign in'}
                <ArrowRight className="size-4" />
              </LoadingButton>
            </div>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isSetup ? (
              <>
                Already set up?{' '}
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setPhase('login')}
                >
                  Sign in
                </Button>
              </>
            ) : (
              <>
                Need a fresh start?{' '}
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setPhase('setup')}
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

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  showPassword: boolean
  onTogglePassword: () => void
  autoComplete: string
}

function PasswordInput({
  value,
  onChange,
  onBlur,
  showPassword,
  onTogglePassword,
  autoComplete
}: PasswordInputProps): React.JSX.Element {
  return (
    <div className="relative">
      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        type={showPassword ? 'text' : 'password'}
        autoComplete={autoComplete}
        className="pr-10 pl-9"
      />
      <button
        type="button"
        onClick={onTogglePassword}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
