import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './AppRoutes'
import { AuthGate } from './components/auth/AuthGate'
import { SessionProvider } from './context/session-context'
import {
  useIdentityStatus,
  useIdentitySession,
  useLogout,
  useCommitSession
} from './lib/identity-queries'

function App(): React.JSX.Element {
  const statusQuery = useIdentityStatus()
  const authenticated = statusQuery.data === 'AUTHENTICATED'
  const sessionQuery = useIdentitySession(authenticated)
  const logout = useLogout()
  const commitSession = useCommitSession()

  const session = authenticated ? (sessionQuery.data ?? null) : null

  if (session) {
    return (
      <SessionProvider value={session} onSignOut={() => void logout.mutate()}>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </SessionProvider>
    )
  }

  return (
    <AuthGate
      status={statusQuery.data}
      statusPending={statusQuery.isPending}
      onAuthenticated={commitSession}
    />
  )
}

export default App
