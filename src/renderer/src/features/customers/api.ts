import { CustomerStore } from './mock-data'
import type { Customer } from './types'

/**
 * Async facade over the in-memory customer store — the seam where the future
 * SQLite command layer drops in (docs/02, docs/09 read models). A small delay
 * keeps the loading state honest.
 */
const store = new CustomerStore()
const delay = (ms = 120): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

export const api = {
  async list(): Promise<Customer[]> {
    await delay()
    return store.all()
  },
  async get(id: string): Promise<Customer | undefined> {
    await delay(60)
    return store.byId(id)
  }
}
