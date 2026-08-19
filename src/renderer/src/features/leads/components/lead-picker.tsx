import { useMemo, useState } from 'react'
import { ChevronsUpDown, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useLeads } from '../queries'
import { displayPhone } from '../format'
import type { Lead, StageKey } from '../types'

/**
 * Searchable lead combobox (Command + Popover). Used by the global Schedule
 * follow-up / Log activity dialogs to pick *who* a future action belongs to
 * before the form takes over. Shows name and phone per lead.
 */
export function LeadPicker({
  value,
  onChange,
  excludeStage,
  placeholder = 'Search a lead…',
  invalid
}: {
  value: number
  onChange: (lead: Lead) => void
  /** Hide leads currently sitting in these stages (e.g. lost leads). */
  excludeStage?: StageKey[]
  placeholder?: string
  /** Sets `aria-invalid` + destructive border on the trigger (reactive form states). */
  invalid?: boolean
}): React.JSX.Element {
  const { data } = useLeads()
  const [open, setOpen] = useState(false)

  const leads = useMemo(() => {
    const all = data ?? []
    const excluded = new Set(excludeStage ?? [])
    return excluded.size ? all.filter((l) => !excluded.has(l.stage)) : all
  }, [data, excludeStage])

  const selected = leads.find((l) => l.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-9 w-full justify-between gap-2 rounded-md px-3 text-sm font-normal',
            invalid &&
              'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40'
          )}
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] rounded-lg p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search by name or phone…" />
          <CommandList>
            <CommandEmpty>No leads found.</CommandEmpty>
            <CommandGroup>
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={String(lead.id)}
                  onSelect={() => {
                    onChange(lead)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{lead.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {displayPhone(lead.phone)}
                    </span>
                  </span>
                  {lead.owner ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {lead.owner.name}
                    </span>
                  ) : null}
                  {selected?.id === lead.id ? <UserRound className="ml-auto size-3.5" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
