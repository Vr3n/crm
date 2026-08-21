import type { OrganizationProfile, StaffMember, Role } from './types'

interface CreateStaffInput {
  fullName: string
  email: string
  password: string
  roleName: string
}

/**
 * Thin IPC facade for the identity surface. Every method delegates to the
 * preload bridge (`window.api.identityRead.*` or `window.api.identity.*`).
 */
export const api = {
  organization: (): Promise<OrganizationProfile> =>
    window.api.identityRead.organization() as unknown as Promise<OrganizationProfile>,
  staff: (): Promise<StaffMember[]> =>
    window.api.identityRead.staff() as unknown as Promise<StaffMember[]>,
  roles: (): Promise<Role[]> =>
    window.api.identityRead.roles() as unknown as Promise<Role[]>,
  createStaff: (input: CreateStaffInput): Promise<StaffMember> =>
    window.api.identity.createStaff(input) as unknown as Promise<StaffMember>,
  updateStaff: (_input: Record<string, unknown>): Promise<StaffMember> =>
    Promise.resolve({} as StaffMember),
  updateRole: (_input: Record<string, unknown>): Promise<Role> =>
    Promise.resolve({} as Role),
  updateOrganization: (_input: Record<string, unknown>): Promise<OrganizationProfile> =>
    Promise.resolve({} as OrganizationProfile)
}
