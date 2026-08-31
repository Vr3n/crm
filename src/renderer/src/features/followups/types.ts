import type { StageKey } from '@/features/leads/types'

/**
 * Follow-ups page types (Module 01 §25). Follow-ups are *future work* — the
 * flattened rows below are derived from the leads list so the whole app shares
 * one source of truth. Buckets split the queue by urgency: overdue / today /
 * upcoming / done.
 */
export type FollowUpBucket = 'all' | 'overdue' | 'today' | 'upcoming' | 'done'

export interface FollowUpRow {
  id: number
  leadId: number
  leadName: string
  stage: StageKey
  title: string
  dueAt: string
  extensionReason?: string
  notes?: string
  completedAt?: string
  cancelledAt?: string
  ownerId?: number
  ownerName?: string
}

export interface FollowUpFilters {
  bucket: FollowUpBucket
  search: string
}
