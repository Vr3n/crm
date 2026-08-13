import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean
  loadingLabel?: string
}

/**
 * Button that swaps its label for an inline spinner while `loading`. Press
 * feedback (scale-down) is applied via CSS so it always reflects the physical
 * interaction, independent of animation preferences.
 */
export function LoadingButton({
  loading,
  loadingLabel,
  disabled,
  className,
  children,
  ...props
}: LoadingButtonProps): React.JSX.Element {
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      className={`active:scale-[0.985] ${className ?? ''}`}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingLabel ?? 'Please wait…'}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
