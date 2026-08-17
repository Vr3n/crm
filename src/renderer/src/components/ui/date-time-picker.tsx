import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * Date + time picker in the blocky 0-radius language: a Calendar popover for the
 * day plus hour/minute selects, emitting a single ISO string. Replaces the bare
 * `datetime-local` inputs so scheduling reads like the rest of the design system.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick a date & time'
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const parsed = value ? new Date(value) : null
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null

  function setDay(day: Date | undefined): void {
    if (!day) return
    const base = valid ?? new Date()
    const next = new Date(day)
    next.setHours(base.getHours(), base.getMinutes())
    onChange(next.toISOString())
  }

  function setHour(hour: number): void {
    if (!valid) return
    const next = new Date(valid)
    next.setHours(hour)
    onChange(next.toISOString())
  }

  function setMinute(minute: number): void {
    if (!valid) return
    const next = new Date(valid)
    next.setMinutes(minute)
    onChange(next.toISOString())
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 w-full justify-start gap-2 rounded-md px-3 text-sm font-normal',
            !valid && 'text-muted-foreground'
          )}
        >
          <CalendarClock className="size-4 text-muted-foreground" />
          {valid ? (
            <span className="tabular-nums">{format(valid, 'EEE, d MMM · h:mm a')}</span>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-lg p-0" align="start" sideOffset={6}>
        <Calendar mode="single" selected={valid ?? undefined} onSelect={setDay} className="w-72" />
        <div className="flex items-center gap-2 border-t p-2">
          <Select
            value={valid ? String(valid.getHours()) : undefined}
            onValueChange={(v) => setHour(Number(v))}
            disabled={!valid}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue placeholder="Hour" />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {pad(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">:</span>
          <Select
            value={valid ? String(valid.getMinutes()) : undefined}
            onValueChange={(v) => setMinute(Number(v))}
            disabled={!valid}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue placeholder="Min" />
            </SelectTrigger>
            <SelectContent>
              {MINUTES.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {pad(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
