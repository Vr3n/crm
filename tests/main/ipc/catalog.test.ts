import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcResult } from '../../../src/shared/contracts/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { registerCatalogIpc } from '../../../src/main/ipc/catalog'
import { createLead } from '../../../src/main/application/leads'
import { planRepo } from '../../../src/main/repositories/catalog'
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
  registerCatalogIpc()
})

const VALID_PLAN = {
  name: 'Strength Bundle',
  description: 'Weights + HIIT zones.',
  duration: 'MONTHLY',
  billingFrequency: 'ONE_TIME',
  basePriceMinor: 220000,
  accessWindow: 'ALL_HOURS',
  startTime: '06:00',
  endTime: '23:00',
  isActive: true
}

describe('registerCatalogIpc', () => {
  it('lists plans over IPC as { ok: true, data }', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_LIST_PLANS)({})) as {
      ok: true
      data: Array<{ name: string }>
    }
    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(7)
    expect(result.data.map((p) => p.name)).toContain('Annual Premium')
  })

  it('creates a plan over IPC', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, VALID_PLAN)) as {
      ok: true
      data: { id: number; name: string }
    }
    expect(result.ok).toBe(true)
    expect(result.data.name).toBe('Strength Bundle')
  })

  it('rejects malformed create input with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, { name: 42 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns the permission error envelope without plan.create', async () => {
    seedOrgWithSession('Sales')
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)({}, VALID_PLAN)) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('PERMISSION_DENIED')
  })

  it('updates a plan over IPC', async () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_UPDATE_PLAN)(
      {},
      {
        planId: target.id,
        ...VALID_PLAN,
        name: 'Renamed Bundle'
      }
    )) as { ok: true; data: { name: string } }
    expect(result.ok).toBe(true)
    expect(result.data.name).toBe('Renamed Bundle')
  })

  it('deletes an unreferenced plan over IPC', async () => {
    seedOrgWithSession()
    const created = (await handlerFor(IPC_CHANNELS.CATALOG_CREATE_PLAN)(
      {},
      {
        ...VALID_PLAN,
        name: 'Throwaway'
      }
    )) as { ok: true; data: { id: number } }

    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)(
      {},
      {
        planId: created.data.id
      }
    )) as { ok: true; data: undefined }
    expect(result.ok).toBe(true)
    expect(
      getDb()
        .prepare('SELECT COUNT(*) AS n FROM membership_plans WHERE id = ?')
        .get(created.data.id)
    ).toEqual({ n: 0 })
  })

  it('returns a CONFLICT envelope when deleting a referenced plan', async () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    createLead({
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      sourceId: (getDb().prepare('SELECT id FROM lead_sources LIMIT 1').get() as { id: number }).id,
      planId: target.id
    })
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)(
      {},
      {
        planId: target.id
      }
    )) as { ok: false; error: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('CONFLICT')
  })

  it('rejects a malformed delete input with VALIDATION_ERROR', async () => {
    seedOrgWithSession()
    const result = (await handlerFor(IPC_CHANNELS.CATALOG_DELETE_PLAN)({}, { planId: 0 })) as {
      ok: false
      error: { code: string }
    }
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('VALIDATION_ERROR')
  })
})
