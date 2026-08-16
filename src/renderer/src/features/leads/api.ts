import { LeadStore } from './mock-data'
import type {
  ActivityTypeKey,
  Lead,
  LostReasonKey,
  NewLeadInput,
  StageKey
} from './types'

/**
 * Async facade over the in-memory store.
 *
 * This is the seam where the future backend drops in: keep these signatures
 * and swap the bodies for IPC calls (e.g. `window.api.leads.list()`) once the
 * SQLite command layer exists. A small artificial delay keeps the loading /
 * mutation states honest so the UI reads like a real system.
 */

const store = new LeadStore()
const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async list(): Promise<Lead[]> {
    await delay()
    return store.all()
  },
  async get(id: string): Promise<Lead | undefined> {
    await delay(60)
    return store.byId(id)
  },
  async create(input: NewLeadInput, actor: string): Promise<Lead> {
    await delay()
    return store.create(input, actor)
  },
  async moveStage(id: string, to: StageKey, note: string, actor: string): Promise<Lead> {
    await delay()
    return store.moveStage(id, to, note, actor)
  },
  async logActivity(id: string, type: ActivityTypeKey, note: string, actor: string): Promise<Lead> {
    await delay()
    return store.logActivity(id, type, note, actor)
  },
  async addFollowUp(
    id: string,
    title: string,
    dueAt: string,
    note: string | undefined,
    actor: string
  ): Promise<Lead> {
    await delay()
    return store.addFollowUp(id, title, dueAt, note, actor)
  },
  async completeFollowUp(followUpId: string, actor: string): Promise<Lead> {
    await delay()
    return store.completeFollowUp(followUpId, actor)
  },
  async markLost(id: string, reason: LostReasonKey, note: string, actor: string): Promise<Lead> {
    await delay()
    return store.markLost(id, reason, note, actor)
  },
  async convert(id: string, actor: string): Promise<Lead> {
    await delay()
    return store.convert(id, actor)
  }
}

export const currentActor = 'Priya Verma'