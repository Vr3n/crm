import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  /** Optional node rendered right-aligned in the helper line (e.g. a character counter). */
  trailing?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * Standard labeled field block: label above input, helper below, error below input
 * with `role="alert"` and the offending input marked `aria-invalid` via a matched
 * `aria-describedby`. Error text animates in (respects reduced motion via tw-animate-css).
 */
export function Field({
  id,
  label,
  error,
  hint,
  trailing,
  className,
  children
}: FieldProps): React.JSX.Element {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>

      {React.cloneElement(
        children as React.ReactElement<{
          id?: string
          'aria-invalid'?: boolean
          'aria-describedby'?: string
        }>,
        {
          id,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy
        }
      )}

      {!error && (hint || trailing) ? (
        <div className="flex items-center justify-between gap-3">
          {hint ? (
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      ) : null}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex animate-in items-center gap-1.5 text-xs font-medium text-destructive fade-in-0 slide-in-from-top-1 duration-200"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
