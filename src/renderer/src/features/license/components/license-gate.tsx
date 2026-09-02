import { useQuery } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import { api } from '../api'
import { ActivateLicense } from './activate-license'
import { LicenseInvalid } from './license-invalid'
import type { LicenseStatus } from '../types'

interface LicenseGateProps {
  /** If true, the license has been verified — render children. */
  children: React.ReactNode
}

/**
 * Gates the entire app behind a license check.
 * Renders:
 * - A loading spinner while verifying,
 * - The activation wizard if UNLICENSED,
 * - A support/retry dialog if INVALID,
 * - `children` if ACTIVE.
 */
export function LicenseGate({ children }: LicenseGateProps): React.JSX.Element {
  const statusQuery = useQuery({
    queryKey: ['license', 'status'],
    queryFn: api.status,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false
  })

  const supportQuery = useQuery({
    queryKey: ['license', 'supportInfo'],
    queryFn: api.supportInfo,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false
  })

  const status: LicenseStatus | undefined = statusQuery.data
  const supportInfo = supportQuery.data

  // Loading
  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
        <div className="flex size-12 animate-pulse items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Crown className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">Verifying license…</p>
      </div>
    )
  }

  // Active — pass through to the app
  if (status?.state === 'ACTIVE') {
    return <>{children}</>
  }

  // Unlicensed — show activation wizard
  if (status?.state === 'UNLICENSED') {
    return (
      <ActivateLicense
        onSuccess={() => statusQuery.refetch()}
        supportInfo={supportInfo}
      />
    )
  }

  // Invalid — show support/retry dialog
  return (
    <LicenseInvalid
      status={status ?? { state: 'INVALID', reason: 'CORRUPT' }}
      onRetry={() => statusQuery.refetch()}
      supportInfo={supportInfo}
    />
  )
}
