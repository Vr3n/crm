import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Clipboard, Crown, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LicenseStatus } from '../types'

interface LicenseInvalidProps {
  status: LicenseStatus
  onRetry: () => void
  supportInfo: { organization: string | null; fingerprint: Record<string, string> } | undefined
}

const REASON_MESSAGES: Record<string, string> = {
  BAD_SIGNATURE: 'The license file appears to have been modified or corrupted.',
  FINGERPRINT_MISMATCH:
    'This license was issued for a different computer. Contact support to get a new license for this machine.',
  CORRUPT: 'The license file could not be read. Make sure you are using the original file from your vendor.'
}

export function LicenseInvalid({ status, onRetry, supportInfo }: LicenseInvalidProps): React.JSX.Element {
  const queryClient = useQueryClient()

  function handleCopySupportInfo(): void {
    if (!supportInfo) return
    const lines = [
      'CrownCRM Support Request',
      '',
      `Reason: ${REASON_MESSAGES[status.reason ?? ''] ?? 'License invalid'}`,
      '',
      'Machine Fingerprint:',
      `  Machine GUID : ${supportInfo.fingerprint.machineGuid}`,
      `  Motherboard  : ${supportInfo.fingerprint.motherboard}`,
      `  System Disk  : ${supportInfo.fingerprint.systemDisk}`,
      `  CPU          : ${supportInfo.fingerprint.cpu}`,
      '',
      'Please email this information to your vendor along with your organization name.'
    ]
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Support info copied — paste it into your email'),
      () => toast.error('Could not copy to clipboard')
    )
  }

  function handleRetry(): void {
    queryClient.invalidateQueries({ queryKey: ['license'] })
    onRetry()
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
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
            License requires attention.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-primary-foreground/80">
            {REASON_MESSAGES[status.reason ?? ''] ?? 'The license could not be verified.'}
          </p>
        </div>

        <p className="relative text-sm text-primary-foreground/70">
          Contact support to resolve this
        </p>
      </aside>

      {/* Content panel */}
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        {/* Mobile brand */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Crown className="size-5" />
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">CrownCRM</span>
        </div>

        <div className="mx-auto w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">License invalid</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {status.reason === 'BAD_SIGNATURE' && 'Signature verification failed'}
                {status.reason === 'FINGERPRINT_MISMATCH' && 'This license is for a different computer'}
                {status.reason === 'CORRUPT' && 'License file could not be parsed'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {REASON_MESSAGES[status.reason ?? ''] ?? 'The license could not be verified.'}
          </div>

          {/* Support info */}
          {supportInfo ? (
            <div className="mt-6 rounded-lg border px-4 py-3">
              <p className="text-sm font-medium">Machine Information</p>
              <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                <p>Organization : {supportInfo.organization ?? '(not set)'}</p>
                <p>Machine GUID : {supportInfo.fingerprint.machineGuid}</p>
                <p>Motherboard  : {supportInfo.fingerprint.motherboard}</p>
                <p>System Disk  : {supportInfo.fingerprint.systemDisk}</p>
                <p>CPU          : {supportInfo.fingerprint.cpu}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3">
            <Button
              onClick={handleCopySupportInfo}
              variant="outline"
              className="w-full"
              size="lg"
              disabled={!supportInfo}
            >
              <Clipboard className="mr-2 size-4" />
              Copy support info
            </Button>

            <Button
              onClick={handleRetry}
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 size-4" />
              Try again
            </Button>
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Copy the support info above and email it to your vendor.
            <br />
            They will issue a new license for this computer.
          </p>
        </div>
      </main>
    </div>
  )
}
