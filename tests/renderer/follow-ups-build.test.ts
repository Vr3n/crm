import { describe, it, expect } from 'vitest'
import { buildFollowUpRows } from '@/features/followups/build'
import type { Lead } from '@/features/leads/types'

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 1,
    personId: 1,
    name: 'Alice',
    phone: '9000000000',
    email: 'a@x.com',
    stage: 'NEW',
    isBlacklisted: false,
    followUps: [{ id: 1, leadId: 1, title: 'Call', dueAt: '2026-01-02' }],
    createdAt: new Date().toISOString(),
    sourceId: 1,
    ...overrides
  } as unknown as Lead
}

describe('buildFollowUpRows', () => {
  it('propagates the person blacklist flag onto follow-up rows', () => {
    const rows = buildFollowUpRows([lead({ isBlacklisted: true })])
    expect(rows).toHaveLength(1)
    expect(rows[0].isBlacklisted).toBe(true)
    expect(rows[0].personId).toBe(1)
  })

  it('defaults blacklist to false', () => {
    const rows = buildFollowUpRows([lead({})])
    expect(rows[0].isBlacklisted).toBe(false)
  })
})