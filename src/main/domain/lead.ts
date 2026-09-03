import { InvalidStateTransitionError } from './errors'

/**
 * Sales & CRM domain (Module 01).
 *
 * Stage logic reads ONLY the boolean flags on the stage row (`is_initial`,
 * `is_won`, `is_lost`) — never the literal stage name, because stage names are
 * configurable per-org reference data (ADR-0007). Everything here is pure: no
 * I/O, no Electron, no Drizzle, so it is trivially unit-testable.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export type LeadStatus = 'OPEN' | 'WON' | 'LOST'

export interface LeadStage {
  id: number
  name: string
  sortOrder: number
  isInitial: boolean
  isWon: boolean
  isLost: boolean
  active: boolean
}

export interface Person {
  id: number
  organizationId: number
  fullName: string
  phone: string
  email: string | null
  createdAt: string
  updatedAt: string
}

export interface Lead {
  id: number
  organizationId: number
  personId: number
  sourceId: number
  currentStageId: number
  ownerUserId: number | null
  customerId: number | null
  planId: number | null
  goal: string | null
  notes: string | null
  lostReasonId: number | null
  lostAt: string | null
  lostBy: number | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface LeadActivity {
  id: number
  organizationId: number
  leadId: number
  typeId: number
  note: string | null
  occurredAt: string
  createdBy: number
  createdAt: string
}

export interface LeadFollowup {
  id: number
  organizationId: number
  leadId: number
  title: string
  dueAt: string
  extensionReason: string | null
  notes: string | null
  completedAt: string | null
  completedBy: number | null
  cancelledAt: string | null
  cancelledBy: number | null
  cancelledReason: string | null
  createdBy: number
  createdAt: string
}

export interface LeadStageHistoryEntry {
  id: number
  organizationId: number
  leadId: number
  fromStageId: number | null
  toStageId: number
  activityId: number | null
  reason: string | null
  changedBy: number
  changedAt: string
}

/** Derived, never stored (D3): the lead's status comes from its current stage. */
export function deriveLeadStatus(stage: LeadStage): LeadStatus {
  if (stage.isWon) return 'WON'
  if (stage.isLost) return 'LOST'
  return 'OPEN'
}

/**
 * The only place that decides whether a stage change may happen. Terminal stages
 * (is_won/is_lost) are absorbing: a lead in one can never change stage again.
 * WON/LOST cannot be entered via `assertMoveAllowed` in this module — WON is
 * reachable only through the Module 07 conversion path, and LOST only through
 * `assertCanMarkLost`.
 */
export class LeadStageMachine {
  constructor(private readonly stages: LeadStage[]) {}

  /** The stage a new lead is placed on. Throws if the org has no initial stage. */
  initialStage(): LeadStage {
    const initial = this.stages.find((s) => s.active && s.isInitial)
    if (!initial) {
      throw new InvalidStateTransitionError('No initial lead stage is configured')
    }
    return initial
  }

  /** The active terminal stage for the given flag (lost for LOST moves). */
  terminalStage(flag: 'isWon' | 'isLost'): LeadStage {
    const terminal = this.stages.find((s) => s.active && s[flag])
    if (!terminal) {
      throw new InvalidStateTransitionError('No configured stage is marked as lost')
    }
    return terminal
  }

  /**
   * Validates a normal MoveLeadStage. `hasActivity` is true when the caller
   * supplied a valid activity_id. Target must be an active non-terminal stage;
   * WON/LOST targets are rejected here (D2, D10).
   */
  assertMoveAllowed(current: LeadStage, target: LeadStage, hasActivity: boolean): void {
    if (!current.active) {
      throw new InvalidStateTransitionError('The current stage is inactive')
    }
    if (current.isWon || current.isLost) {
      throw new InvalidStateTransitionError('A terminal lead cannot change stage')
    }
    if (!target.active) {
      throw new InvalidStateTransitionError('The target stage is inactive')
    }
    if (target.isWon || target.isLost) {
      throw new InvalidStateTransitionError('WON/LOST are terminal and unreachable here')
    }
    if (!hasActivity) {
      throw new InvalidStateTransitionError('Every stage change requires a recorded activity')
    }
  }

  /**
   * Validates a LOST move. No activity is required — a mandatory lost_reason is
   * the explicit cause the stage-move rule demands (D8).
   */
  assertCanMarkLost(current: LeadStage): void {
    if (!current.active) {
      throw new InvalidStateTransitionError('The current stage is inactive')
    }
    if (current.isWon || current.isLost) {
      throw new InvalidStateTransitionError('This lead is already terminal')
    }
  }
}

/**
 * Returns the org-local day window for `date` as UTC ISO instants. `due_at` is
 * stored in UTC, but "today"/"overdue" are wall-clock concepts in the gym's
 * timezone, so the query boundary is computed here and applied to the stored
 * UTC column (D5).
 */
export function localDayUtcRange(tz: string, date: Date): { start: string; end: string } {
  const offsetMin = tzOffsetMinutes(tz, date)
  const start = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - offsetMin * 60_000
  )
  const end = new Date(start.getTime() + 86_400_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** The IANA timezone's UTC offset (minutes) for the given instant. */
function tzOffsetMinutes(tz: string, date: Date): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value
    const m = part ? /GMT([+-])(\d{2}):(\d{2})/.exec(part) : null
    if (!m) return 0
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return 0
  }
}
