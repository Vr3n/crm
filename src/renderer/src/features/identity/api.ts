import { IdentityStore } from './store'
import type {
  CreateStaffInput,
  UpdateOrganizationInput,
  UpdateRoleInput,
  UpdateStaffInput
} from './store'
import type { OrganizationProfile, Role, StaffMember } from './types'

/**
 * Async facade over the identity store. This is the seam where the real
 * SQLite-backed IPC layer drops in — `identity:createStaff`, `identity:session`
 * and `identity:setup` already exist in `src/main/ipc/identity.ts`; the rest of
 * the read/update channels land the same way (e.g. `window.api.identity.staff()`,
 * `window.api.identity.updateRole()`). Keep these signatures and swap the bodies.
 */

const store = new IdentityStore()

const delay = (ms = 220): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function resolve<T>(value: T): Promise<T> {
  await delay()
  return value
}

export const api = {
  async organization(): Promise<OrganizationProfile> {
    return resolve(store.listOrganization())
  },

  async staff(): Promise<StaffMember[]> {
    return resolve(store.listStaff())
  },

  async roles(): Promise<Role[]> {
    return resolve(store.listRoles())
  },

  async createStaff(input: CreateStaffInput): Promise<StaffMember> {
    await delay(320)
    return store.createStaff(input)
  },

  async updateStaff(input: UpdateStaffInput): Promise<StaffMember> {
    await delay(260)
    return store.updateStaff(input)
  },

  async updateRole(input: UpdateRoleInput): Promise<Role> {
    await delay(260)
    return store.updateRole(input)
  },

  async updateOrganization(input: UpdateOrganizationInput): Promise<OrganizationProfile> {
    await delay(260)
    return store.updateOrganization(input)
  }
}
