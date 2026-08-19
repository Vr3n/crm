import { useState } from 'react'
import { PhoneCall, Mail } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { SOURCES, STAGES, isTerminal } from '../constants'
import { computeQuality } from '../data-quality'
import { displayPhone, timeAgo } from '../format'
import type { Lead, StageKey } from '../types'
import { QualityDot } from './quality-dot'
import { StageBadge } from './stage-badge'

/**
 * Airtable-minimal lead table: one row per lead, quiet hairlines, no heavy
 * card chrome. Stage is edited inline and always routes through the strict
 * move dialog (LOST opens its reason-requiring dialog; WON is unreachable
 * until the Module 02 conversion handoff exists).
 */
export function LeadTable({
  leads,
  onOpen,
  onStageChange
}: {
  leads: Lead[]
  onOpen: (lead: Lead) => void
  onStageChange: (lead: Lead, to: StageKey) => void
}): React.JSX.Element {
  const all = leads
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const toggleRow = (id: number): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = (value: boolean): void =>
    setSelected(value ? new Set(all.map((l) => l.id)) : new Set())

  const nextFollowUp = (lead: Lead): string => {
    const open = lead.followUps
      .filter((f) => !f.completedAt)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
    return open ? timeAgo(open.dueAt) : '—'
  }
  const lastActivity = (lead: Lead): string => {
    const sorted = [...lead.activities].sort((a, b) => b.at.localeCompare(a.at))
    return sorted[0] ? timeAgo(sorted[0].at) : '—'
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox
                checked={
                  all.length > 0 && selected.size === all.length
                    ? true
                    : selected.size > 0
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(value) => toggleAll(Boolean(value))}
                aria-label="Select all leads"
              />
            </TableHead>
            <TableHead className="w-[22%] text-primary">Lead</TableHead>
            <TableHead className="text-primary">Contact</TableHead>
            <TableHead className="text-primary">Source</TableHead>
            <TableHead className="text-primary">Stage</TableHead>
            <TableHead className="text-primary">Owner</TableHead>
            <TableHead className="text-primary">Next follow-up</TableHead>
            <TableHead className="text-right text-primary">Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {all.map((lead) => {
            const q = computeQuality(lead, all)
            const terminal = isTerminal(lead.stage)
            return (
              <TableRow
                key={lead.id}
                data-state={selected.has(lead.id) ? 'selected' : undefined}
                className="group cursor-pointer data-[state=selected]:bg-primary/5"
                onClick={() => onOpen(lead)}
              >
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(lead.id)}
                    onCheckedChange={() => toggleRow(lead.id)}
                    aria-label={`Select ${lead.name}`}
                    className="group-hover:border-muted-foreground/60"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{lead.name}</span>
                    <QualityDot quality={q} />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <PhoneCall className="size-3" /> {displayPhone(lead.phone)}
                    </span>
                    {lead.email ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="size-3" /> {lead.email}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{SOURCES[lead.source]}</span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={lead.stage}
                    onValueChange={(v) => v !== lead.stage && onStageChange(lead, v as StageKey)}
                    disabled={terminal}
                  >
                    <SelectTrigger className="h-8 w-36 border-transparent bg-transparent text-left hover:bg-accent">
                      <SelectValue>
                        <StageBadge stage={lead.stage} />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {STAGES.filter((s) => s.key !== 'WON').map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {lead.owner?.name || 'Unassigned'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{nextFollowUp(lead)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-muted-foreground">{lastActivity(lead)}</span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}