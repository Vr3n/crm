/**
 * Lead-management domain types (Module 01 — Sales / CRM).
 *
 * These mirror the domain shapes from docs/01-people-leads-sales.md: a Lead is
 * a sales opportunity for a Person, distinct from Note / Follow-up / Activity.
 * Stages are config-driven (see constants.ts) — logic only reads the
 * `isWon` / `isLost` flags, never the literal stage name.
 *
 * This is a *frontend-only* prototype: the mock api/store below stands in for
 * the future SQLite-backed command layer, so every mutation here is transient
 * (in-memory) and resets on reload.
 */

export type StageKey =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'VISIT_SCHEDULED'
  | 'VISITED'
  | 'TRIAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'

export interface StageConfig {
  key: StageKey
  label: string
  /** Short column header used on the board. */
  short: string
  isWon?: boolean
  isLost?: boolean
  /** Tint used for the stage pill / board column accent. */
  tone: 'default' | 'primary' | 'success' | 'destructive'
}

export type SourceKey =
  | 'WALK_IN'
  | 'PHONE'
  | 'REFERRAL'
  | 'INSTAGRAM'
  | 'WEBSITE'
  | 'ADVERTISEMENT'
  | 'MEMBER_REFERRAL'
  | 'WHATSAPP'
  | 'OTHER'

export type ActivityTypeKey =
  | 'LEAD_CREATED'
  | 'PHONE_CALL'
  | 'WALK_IN'
  | 'WHATSAPP'
  | 'GYM_TOUR'
  | 'TRIAL'
  | 'NO_SHOW'
  | 'PRICE_DISCUSSION'
  | 'MEMBERSHIP_PROPOSAL'
  | 'STAGE_CHANGE'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_DONE'
  | 'NOTE'
  | 'LOST'
  | 'WON'

export type LostReasonKey =
  | 'TOO_EXPENSIVE'
  | 'JOINED_COMPETITOR'
  | 'NOT_INTERESTED'
  | 'NO_RESPONSE'
  | 'MOVED_AWAY'
  | 'MEDICAL'
  | 'WRONG_CONTACT'
  | 'OTHER'

export interface OwnerRef {
  id: string
  name: string
}

export interface FollowUp {
  id: string
  leadId: string
  title: string
  dueAt: string
  completedAt?: string
  note?: string
}

export interface LeadActivity {
  id: string
  leadId: string
  type: ActivityTypeKey
  note?: string
  at: string
  by?: string
}

export interface LeadStageHistoryEntry {
  from?: StageKey
  to: StageKey
  at: string
  by?: string
}

export interface Lead {
  id: string
  name: string
  phone?: string
  email?: string
  /** Canonical source key. */
  source: SourceKey
  /** Raw captured source label — may be dirty ("web", "Insta"). */
  sourceLabel: string
  owner?: OwnerRef
  /** Plan / offer they're interested in, if stated. */
  planInterest?: string
  /** Fitness goal, if captured at intake. */
  goal?: string
  stage: StageKey
  createdAt: string
  notes?: string
  lostReason?: LostReasonKey
  lostAt?: string
  convertedAt?: string
  activities: LeadActivity[]
  followUps: FollowUp[]
  stageHistory: LeadStageHistoryEntry[]
}

export interface NewLeadInput {
  name: string
  phone?: string
  email?: string
  source: SourceKey
  planInterest?: string
  goal?: string
  ownerId?: string
  notes?: string
}

export type LeadFilters = {
  search?: string
  stage?: StageKey | 'ALL'
  source?: SourceKey | 'ALL'
  ownerId?: string | 'ALL'
  range: 'today' | 'week' | 'month' | 'all'
}