import { useEffect, useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>

type AuthStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'
type Phase = 'loading' | 'setup' | 'login'

interface AuthGateProps {
  onAuthenticated: (session: SessionContext) => void
}

export function AuthGate({ onAuthenticated }: AuthGateProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

  const handleSetup = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const session = await window.api.identity.setup({
        name: String(data.get('name')),
        ownerFullName: String(data.get('ownerFullName')),
        ownerEmail: String(data.get('ownerEmail')),
        ownerPassword: String(data.get('ownerPassword'))
      })
      onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const session = await window.api.identity.login({
        email: String(data.get('email')),
        password: String(data.get('password'))
      })
      onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{phase === 'setup' ? 'Set up your organization' : 'Sign in'}</CardTitle>
          <CardDescription>
            {phase === 'setup'
              ? 'Create the first organization and its Owner account.'
              : 'Sign in to continue.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={phase === 'setup' ? handleSetup : handleLogin}
            className="flex flex-col gap-4"
          >
            {phase === 'setup' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="name" className="text-sm font-medium">
                    Organization name
                  </label>
                  <Input id="name" name="name" placeholder="FitZone Aurangabad" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ownerFullName" className="text-sm font-medium">
                    Owner full name
                  </label>
                  <Input id="ownerFullName" name="ownerFullName" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ownerEmail" className="text-sm font-medium">
                    Owner email
                  </label>
                  <Input id="ownerEmail" name="ownerEmail" type="email" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ownerPassword" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="ownerPassword"
                    name="ownerPassword"
                    type="password"
                    required
                    minLength={8}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input id="password" name="password" type="password" required />
                </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : phase === 'setup' ? 'Create organization' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
