import { Sidebar } from './components/layout/Sidebar'
import { DashboardPage } from './components/dashboard/DashboardPage'

function App(): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <DashboardPage />
    </div>
  )
}

export default App