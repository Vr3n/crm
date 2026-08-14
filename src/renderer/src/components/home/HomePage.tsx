import { ArrowUpRight, Building2, LayoutDashboard, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { initials } from '@/lib/validation'

interface HomePageProps {
  organizationName: string
  userFullName: string
  userEmail: string
  roleName: string
  isSuper: boolean
}

export function HomePage({
  organizationName,
  userFullName,
  userEmail,
  roleName,
  isSuper
}: HomePageProps): React.JSX.Element {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-6 py-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{organizationName}</h1>
          <p className="text-sm text-muted-foreground">Your workspace</p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {/* Signed-in identity */}
        <Card className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              Your account
            </CardTitle>
            <CardDescription>Signed in to {organizationName}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading font-semibold text-primary">
              {initials(userFullName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{userFullName}</p>
                <Badge>{roleName}</Badge>
                {isSuper ? <Badge variant="outline">full access</Badge> : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
            </div>
          </CardContent>
        </Card>

        {/* Empty / ready state — invitation, not a void */}
        <Card className="border-dashed animate-in fade-in-0 slide-in-from-bottom-2 duration-500 [animation-delay:120ms]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutDashboard className="size-4 text-primary" />
              Your workspace is ready
            </CardTitle>
            <CardDescription>
              You&apos;re all set. The product features arrive in upcoming releases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {['Members', 'Plans', 'Billing', 'Check-ins'].map((mod) => (
                <li key={mod} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Badge variant="secondary">{mod}</Badge>
                  <ArrowUpRight className="size-3" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
