import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function SaleSectionCard({
  id,
  step,
  title,
  description,
  required,
  badge,
  children
}: {
  id: string
  step: number
  title: string
  description: string
  required?: boolean
  badge?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20">
      <Card className="gap-0 rounded-2xl border bg-card py-0 shadow-sm">
        <CardHeader className="gap-1.5 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
                {step}
              </span>
              <CardTitle id={`${id}-heading`} className="text-sm font-semibold tracking-tight">
                {title}
                {required ? <span className="ml-1 text-destructive">*</span> : null}
              </CardTitle>
              {badge ? (
                <Badge variant="secondary" className="text-[11px]">
                  {badge}
                </Badge>
              ) : null}
            </div>
          </div>
          <CardDescription className="pl-9 text-xs leading-relaxed">{description}</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center">
            {children}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
