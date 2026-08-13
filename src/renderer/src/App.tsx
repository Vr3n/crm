import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { HomePage } from './components/home/HomePage'
import { AuthGate } from './components/auth/AuthGate'

type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>

function App(): React.JSX.Element {
  const [session, setSession] = useState<SessionContext | null>(null)

  const handleSignOut = async (): Promise<void> => {
    await window.api.identity.logout()
    setSession(null)
  }

  if (!session) {
    return <AuthGate onAuthenticated={setSession} />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        userFullName={session.userFullName}
        roleName={session.roleName}
        onSignOut={handleSignOut}
      />
      <HomePage
        organizationName={session.organizationName}
        userFullName={session.userFullName}
        userEmail={session.userEmail}
        roleName={session.roleName}
        isSuper={session.isSuper}
      />
    </div>
  )
}

export default App
