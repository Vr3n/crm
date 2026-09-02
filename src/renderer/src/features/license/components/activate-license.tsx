import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileUp, Clipboard, Crown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { cn } from '@/lib/utils'
import { api } from '../api'
import type { LicenseStatus, LicenseSupportInfo } from '../types'

interface ActivateLicenseProps {
  onSuccess: (status: LicenseStatus) => void
  supportInfo: LicenseSupportInfo | undefined
}

export function ActivateLicense({ onSuccess, supportInfo }: ActivateLicenseProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'paste' | 'file'>('file')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleActivate(content: string): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.activate(content)
      queryClient.invalidateQueries({ queryKey: ['license'] })
      toast.success('License activated')
      onSuccess(result)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Could not activate the license.')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = reader.result as string
      void handleActivate(content)
    }
    reader.readAsText(file)
  }

  function handlePasteSubmit(): void {
    const content = textareaRef.current?.value?.trim()
    if (!content) {
      setError('Paste the license content first.')
      return
    }
    void handleActivate(content)
  }

  function handleCopyFingerprint(): void {
    if (!supportInfo) return
    const text = [
      `Organization: ${supportInfo.organization ?? '(not set)'}`,
      '',
      'Fingerprint:',
      `  Machine GUID : ${supportInfo.fingerprint.machineGuid}`,
      `  Motherboard  : ${supportInfo.fingerprint.motherboard}`,
      `  System Disk  : ${supportInfo.fingerprint.systemDisk}`,
      `  CPU          : ${supportInfo.fingerprint.cpu}`
    ].join('\n')
    navigator.clipboard.writeText(text).then(
      () => toast.success('Fingerprint copied — paste it into your email to support'),
      () => toast.error('Could not copy to clipboard')
    )
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
            Activate your license.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-primary-foreground/80">
            Enter the license file provided by your vendor to start using CrownCRM.
          </p>
        </div>

        <p className="relative text-sm text-primary-foreground/70">
          Your data stays on this machine
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Activate your license</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Select or paste the license file you received from your vendor.
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              <span className="mt-0.5">•</span>
              <span>{error}</span>
            </div>
          ) : null}

          {/* Mode tabs */}
          <div className="mt-8 flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'file'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileUp className="mr-1.5 inline size-4" />
              Select file
            </button>
            <button
              type="button"
              onClick={() => setMode('paste')}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                mode === 'paste'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clipboard className="mr-1.5 inline size-4" />
              Paste content
            </button>
          </div>

          {/* File picker */}
          {mode === 'file' ? (
            <div className="mt-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".dat,.json,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <FileUp className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Click to select license.dat</p>
                  <p className="mt-1 text-xs text-muted-foreground">or drag and drop</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              <textarea
                ref={textareaRef}
                rows={8}
                placeholder='Paste the contents of license.dat here...'
                className="w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <LoadingButton
                loading={submitting}
                onClick={handlePasteSubmit}
                disabled={submitting}
                className="w-full"
                size="lg"
              >
                Activate
                <ArrowRight className="size-4" />
              </LoadingButton>
            </div>
          )}

          {/* Copy fingerprint */}
          <div className="mt-8 rounded-lg border bg-muted/50 px-4 py-3">
            <p className="text-sm font-medium">{"Don't have a license yet?"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Copy your machine fingerprint and email it to your vendor to receive a license file.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleCopyFingerprint}
              disabled={!supportInfo}
            >
              <Clipboard className="mr-1.5 size-3.5" />
              Copy fingerprint to clipboard
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
