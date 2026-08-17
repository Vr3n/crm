import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { OFFER_LIFECYCLES } from '../constants'
import type { OfferLifecycle } from '../types'

export interface OfferFiltersState {
  search: string
  lifecycle: 'ALL' | OfferLifecycle
}

/**
 * Filter bar for the offers list: free-text search plus a lifecycle select so
 * paused and ended offers can be swept out of the active view.
 */
export function OfferFilters({
  filters,
  onChange
}: {
  filters: OfferFiltersState
  onChange: (f: OfferFiltersState) => void
}): React.JSX.Element {
  const hasActive = !!filters.search || filters.lifecycle !== 'ALL'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search offers or codes…"
          className="pl-8"
        />
      </div>

      <Select
        value={filters.lifecycle}
        onValueChange={(v) => onChange({ ...filters, lifecycle: v as OfferFiltersState['lifecycle'] })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Lifecycle" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All offers</SelectItem>
          {OFFER_LIFECYCLES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActive ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange({ search: '', lifecycle: 'ALL' })}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}