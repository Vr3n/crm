import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcResult } from '../../../src/shared/contracts/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { registerSalesIpc } from '../../../src/main/ipc/sales'
import { createLead } from '../../../src/main/application/leads'
import { getDb } from '../../../src/main/db/connection'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc.channels'

setupSalesDb()

type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>

function handlerFor(channel: string): Handler {
  const call = mockHandle.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`No handler registered for "${channel}"`)
  return call[1] as unknown as Handler
}

beforeEach(() => {
  mockHandle.mockClear()
  registerSalesIpc()
})

function sourceId(): number {
  return (getDb().prepare('SELECT id FROM lead_sources LIMIT 1').get() as { id: number }).id
}

/**
 * End-to-end-ish check that the sales IPC layer wires every channel to the
 * application use cases through the { ok, ... } envelope, enforcing session
 * permission gates and input validation.
 */
describe('registerSalesIpc', () => {
  it('creates a lead over IPC and returns { ok: true, data }', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      {
        fullName: 'Ravi Kumar',
        phone: '+91 98123 45678',
        sourceId: sourceId(),
        planInterest: 'Annual Premium',
        goal: 'Weight loss',
        notes: 'Asked about family plan'
      }
    )) as { ok: true; data: { leadId: number } }
    expect(result.ok).toBe(true)
    expect(result.data.leadId).toBeGreaterThan(0)
    const stored = getDb()
      .prepare('SELECT plan_interest, goal, notes FROM leads WHERE id = ?')
      .get(result.data.leadId) as {
      plan_interest: string | null
      goal: string | null
      notes: string | null
    }
    expect(stored).toEqual({
      plan_interest: 'Annual Premium',
      goal: 'Weight loss',
      notes: 'Asked about family plan'
    })
  })

  it('returns the permission error envelope without lead.create', async () => {
    seedOrgWithSession('Finance')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      { fullName: 'Ravi', phone: '9812345678', sourceId: sourceId() }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('rejects malformed input with VALIDATION_ERROR before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE)(
      {},
      { fullName: 'Ravi', phone: 'not-a-number' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('exposes funnel counts over IPC', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS)({})) as {
      ok: true
      data: Array<{ stageName: string; count: number }>
    }
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('lists leads over IPC with paging and nested arrays', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_LIST)({}, { page: 1, limit: 50 })) as {
      ok: true
      data: { items: Array<{ personName: string; activities: unknown[] }>; total: number }
    }
    expect(result.ok).toBe(true)
    expect(Array.isArray(result.data.items)).toBe(true)
    expect(typeof result.data.total).toBe('number')
  })

  it('rejects an invalid list request with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_LIST)({}, { page: 0, limit: 999 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('searches sources over IPC, returning active matches only', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_SOURCES)({}, { query: 'walk' })) as {
      ok: true
      data: Array<{ id: number; name: string; active: boolean }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: expect.any(Number), name: 'Walk-in', active: true }])
  })

  it('rejects a malformed source search before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_SOURCES)({}, { query: 42 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a source over IPC for an owner', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE_SOURCE)(
      {},
      { name: 'Podcast' }
    )) as { ok: true; data: { id: number; name: string; active: boolean } }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ id: expect.any(Number), name: 'Podcast', active: true })
    const stored = getDb()
      .prepare('SELECT name, active FROM lead_sources WHERE id = ?')
      .get(result.data.id) as { name: string; active: number }
    expect(stored).toEqual({ name: 'Podcast', active: 1 })
  })

  it('denies source creation over IPC without settings.manage', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.LEADS_CREATE_SOURCE)(
      {},
      { name: 'Podcast' }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('searches plan interests over IPC', async () => {
    seedOrgWithSession()
    createLead({
      fullName: 'Asha Rao',
      phone: '9876543210',
      sourceId: sourceId(),
      planInterest: 'Annual Premium'
    })

    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS)(
      {},
      { query: 'annual' }
    )) as { ok: true; data: Array<{ id: string; label: string }> }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: 'Annual Premium', label: 'Annual Premium' }])
  })

  it('rejects a malformed plan-interest search before the use case', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS)(
      {},
      { query: 42 }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('searches goals over IPC', async () => {
    seedOrgWithSession()
    createLead({
      fullName: 'Asha Rao',
      phone: '9876543210',
      sourceId: sourceId(),
      goal: 'Weight loss'
    })

    const result = (await handlerFor(IPC_CHANNELS.LEADS_SEARCH_GOALS)({}, { query: 'weight' })) as {
      ok: true
      data: Array<{ id: string; label: string }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([{ id: 'Weight loss', label: 'Weight loss' }])
  })
})
