import { isOwner } from './build'
import { SEED_ORGANIZATION, SEED_ROLES, SEED_STAFF } from './mock-data'
import type { OrganizationProfile, Role, StaffMember, StaffStatus } from './types'

/**
 * In-memory identity store. Mirrors the main-process repositories (`identity.ts`)
 * and its guards: uniqueness of (organization, email), password length, and the
 * Module 15 rules that the Owner cannot be demoted or disabled and system roles
 * cannot be renamed. The async facade in `api.ts` is the seam where these become
 * IPC calls (`identity:createStaff` already exists today).
 */

export interface CreateStaffInput {
  fullName: string
  email: string
  password: string
  roleId: string
}

export interface UpdateStaffInput {
  staffId: string
  status?: StaffStatus
  roleId?: string
}

export interface UpdateRoleInput {
  roleId: string
  name?: string
  description?: string
  permissionCodes?: string[]
}

export interface UpdateOrganizationInput {
  legalName?: string
  billingEmail?: string
  mobileNumber?: string
  timezone?: string
  currency?: string
}

export class IdentityStore {
  private organization: OrganizationProfile = SEED_ORGANIZATION
  private roles: Role[] = SEED_ROLES.map((r) => ({ ...r, permissionCodes: [...r.permissionCodes] }))
  private staff: StaffMember[] = SEED_STAFF.map((s) => ({ ...s }))
  private nextUserId = 200

  listOrganization(): OrganizationProfile {
    return { ...this.organization }
  }

  listRoles(): Role[] {
    return this.roles.map((r) => ({ ...r, permissionCodes: [...r.permissionCodes] }))
  }

  listStaff(): StaffMember[] {
    return [...this.staff].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
  }

  role(id: string): Role | undefined {
    return this.roles.find((r) => r.id === id)
  }

  createStaff(input: CreateStaffInput): StaffMember {
    const fullName = input.fullName.trim()
    const email = input.email.trim().toLowerCase()
    if (!fullName) throw new Error('Full name is required')
    if (!email) throw new Error('Email is required')
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters')
    if (this.staff.some((s) => s.email.toLowerCase() === email)) {
      throw new Error('A user with this email already exists in this organization')
    }
    const role = this.roles.find((r) => r.id === input.roleId)
    if (!role) throw new Error('Role not found')

    const member: StaffMember = {
      id: `staff-${this.nextUserId}`,
      userId: this.nextUserId++,
      fullName,
      email,
      roleId: role.id,
      roleName: role.name,
      isSuper: role.isSuper,
      isSystemRole: role.isSystemRole,
      status: 'ACTIVE',
      joinedAt: new Date().toISOString()
    }
    this.staff = [member, ...this.staff]
    return { ...member }
  }

  /** Change a member's role, or enable/disable them. Owner is protected. */
  updateStaff(input: UpdateStaffInput): StaffMember {
    const member = this.staff.find((s) => s.id === input.staffId)
    if (!member) throw new Error('Staff member not found')
    if (isOwner(member) && (input.roleId || input.status === 'DISABLED')) {
      throw new Error('The Owner cannot be demoted or disabled')
    }

    let roleId = member.roleId
    if (input.roleId) {
      const role = this.roles.find((r) => r.id === input.roleId)
      if (!role) throw new Error('Role not found')
      roleId = role.id
    }
    const role = this.roles.find((r) => r.id === roleId)!

    const updated: StaffMember = {
      ...member,
      roleId,
      roleName: role.name,
      isSuper: role.isSuper,
      isSystemRole: role.isSystemRole,
      status: input.status ?? member.status
    }
    this.staff = this.staff.map((s) => (s.id === updated.id ? updated : s))
    return { ...updated }
  }

  /** Edit a role's description, name (non-system), and permission set. */
  updateRole(input: UpdateRoleInput): Role {
    const role = this.roles.find((r) => r.id === input.roleId)
    if (!role) throw new Error('Role not found')
    if (input.name && input.name !== role.name && role.isSystemRole) {
      throw new Error('System roles cannot be renamed')
    }
    if (input.permissionCodes) {
      role.permissionCodes = [...new Set(input.permissionCodes)]
    }
    if (input.name !== undefined) role.name = input.name.trim()
    if (input.description !== undefined) role.description = input.description.trim() || null
    return { ...role, permissionCodes: [...role.permissionCodes] }
  }

  updateOrganization(input: UpdateOrganizationInput): OrganizationProfile {
    const org = { ...this.organization }
    if (input.legalName !== undefined) org.legalName = input.legalName.trim() || null
    if (input.billingEmail !== undefined) org.billingEmail = input.billingEmail.trim() || null
    if (input.mobileNumber !== undefined) {
      const digits = input.mobileNumber.replace(/\D/g, '')
      if (!/^[026-9]\d{9}$/.test(digits)) throw new Error('Enter a valid 10-digit mobile or landline number')
      org.mobileNumber = digits
    }
    if (input.timezone !== undefined) org.timezone = input.timezone.trim() || null
    if (input.currency !== undefined) org.currency = input.currency.trim().toUpperCase()
    this.organization = org
    return { ...org }
  }
}
