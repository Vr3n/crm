import { PermissionCode } from '../db/permissions'

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL'
export type UserStatus = 'ACTIVE' | 'DISABLED'
export type StaffStatus = 'ACTIVE' | 'INVITED' | 'DISABLED'

export interface Organization {
  id: number
  slug: string
  name: string
  legalName: string | null
  billingEmail: string | null
  mobileNumber: string
  timezone: string | null
  currency: string
  status: OrgStatus
  planTier: string | null
  createdAt: string
}

export interface User {
  id: number
  fullName: string
  email: string
  passwordHash: string
  status: UserStatus
  createdAt: string
}

export interface Role {
  id: number
  organizationId: number
  name: string
  isSystemRole: boolean
  isSuper: boolean
  description: string | null
}

export interface OrganizationStaff {
  id: number
  organizationId: number
  userId: number
  roleId: number
  status: StaffStatus
  joinedAt: string
}

/**
 * The "Organization Context" — the active Organization, User, Role, and resolved
 * Permission set for the current session. Every Command reads organization_id and
 * permission checks from this, never from a fixed column or a request field.
 */
export interface SessionContext {
  organizationId: number
  organizationSlug: string
  organizationName: string
  userId: number
  userFullName: string
  userEmail: string
  roleId: number
  roleName: string
  isSuper: boolean
  permissions: PermissionCode[]
}
