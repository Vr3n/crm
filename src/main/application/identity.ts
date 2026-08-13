import { withTransaction, getDb } from '../db/connection'
import { seedRolesForOrganization } from '../db/seed'
import { hashPassword, verifyPassword } from '../auth/password'
import { requirePermission, currentOrganizationId } from '../auth/session'
import { organizationRepo, userRepo, roleRepo, staffRepo } from '../repositories/identity'
import { getSession, setSession } from '../auth/session'
import { SessionContext } from '../domain/identity'
import { ValidationError, UnauthorizedError, NotFoundError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'

export type AuthStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'

/** Describes whether the app needs first-run setup, login, or nothing. */
export function getAuthStatus(): AuthStatus {
  if (organizationRepo.count() === 0) return 'SETUP_REQUIRED'
  return getSession() ? 'AUTHENTICATED' : 'LOGIN_REQUIRED'
}

export interface SetupOrganizationInput {
  name: string
  slug?: string
  currency?: string
  timezone?: string
  ownerFullName: string
  ownerEmail: string
  ownerPassword: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface CreateStaffMemberInput {
  fullName: string
  email: string
  password: string
  roleName: string
}

export interface CreatedStaffMember {
  userId: number
}

/**
 * Adds a staff member to the current organization with the given role. Gated by
 * the `user.create` permission, so only super roles (Owner/Admin) can do this —
 * the concrete enforcement point for vertical privilege separation.
 */
export function createStaffMember(input: CreateStaffMemberInput): CreatedStaffMember {
  requirePermission(PERMISSIONS.USER_CREATE)
  const organizationId = currentOrganizationId()

  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  if (!fullName) throw new ValidationError('Full name is required')
  if (!email) throw new ValidationError('Email is required')
  if (input.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  if (staffRepo.emailExistsInOrganization(organizationId, email)) {
    throw new ValidationError('A user with this email already exists in this organization')
  }

  const role = roleRepo.findByName(organizationId, input.roleName)
  if (!role) throw new NotFoundError(`Role "${input.roleName}" not found`)

  return withTransaction(() => {
    const user = userRepo.create({
      fullName,
      email,
      passwordHash: hashPassword(input.password)
    })
    staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
    return { userId: user.id }
  })
}

/**
 * First-run setup: creates the single Organization, seeds its roles, creates the
 * Owner User and their OrganizationStaff membership — all in one atomic transaction.
 * Rejects if an organization already exists (v1 provisions exactly one per install).
 */
export function setupOrganization(input: SetupOrganizationInput): SessionContext {
  const name = input.name.trim()
  if (!name) throw new ValidationError('Organization name is required')
  if (!input.ownerFullName.trim()) throw new ValidationError('Owner full name is required')
  if (!input.ownerEmail.trim()) throw new ValidationError('Owner email is required')
  if (input.ownerPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }

  const slug = (input.slug ?? slugify(name)).trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new ValidationError('Slug may only contain lowercase letters, numbers, and hyphens')
  }

  return withTransaction(() => {
    if (organizationRepo.count() > 0) {
      throw new ValidationError('An organization has already been set up on this machine')
    }

    const org = organizationRepo.create({
      slug,
      name,
      currency: input.currency ?? 'INR',
      timezone: input.timezone ?? null,
      legalName: null,
      billingEmail: null
    })

    seedRolesForOrganization(org.id)

    const ownerRole = roleRepo.findByName(org.id, 'Owner')
    if (!ownerRole) throw new NotFoundError('Owner role not found')

    const user = userRepo.create({
      fullName: input.ownerFullName.trim(),
      email: input.ownerEmail.trim().toLowerCase(),
      passwordHash: hashPassword(input.ownerPassword)
    })

    staffRepo.create({ organizationId: org.id, userId: user.id, roleId: ownerRole.id })

    return buildSessionContext(org.id, user.id)
  })
}

/**
 * Local login against the current (single) organization. In v1 the slug is not
 * needed — there is only one organization on the machine.
 */
export function login(input: LoginInput): SessionContext {
  const email = input.email.trim().toLowerCase()
  const orgs = organizationRepo.findAll()
  if (orgs.length === 0) {
    throw new NotFoundError('No organization set up. Run setup first.')
  }
  const org = orgs[0]

  const membership = staffRepo.findActiveForLogin(org.id, email)
  if (!membership || !verifyPassword(input.password, membership.user.passwordHash)) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const session = buildSessionContext(org.id, membership.user.id)
  setSession(session)
  return session
}

/** Builds (and stores) the SessionContext for a user within an organization. */
function buildSessionContext(organizationId: number, userId: number): SessionContext {
  const org = organizationRepo.findById(organizationId)
  const user = userRepo.findById(userId)
  if (!org || !user) throw new NotFoundError('Organization or user not found')

  const row = getStaffRow(organizationId, userId)
  if (!row) throw new NotFoundError('No staff membership found')

  const permissions = roleRepo.findPermissionCodes(row.roleId)

  const session: SessionContext = {
    organizationId: org.id,
    organizationSlug: org.slug,
    organizationName: org.name,
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    roleId: row.roleId,
    roleName: row.roleName,
    isSuper: row.isSuper,
    permissions: permissions as SessionContext['permissions']
  }
  setSession(session)
  return session
}

interface StaffRow {
  roleId: number
  roleName: string
  isSuper: boolean
}

function getStaffRow(organizationId: number, userId: number): StaffRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT r.id AS roleId, r.name AS roleName, r.is_super AS isSuper
       FROM organization_staff os
       JOIN roles r ON r.id = os.role_id
       WHERE os.organization_id = ? AND os.user_id = ?`
    )
    .get(organizationId, userId) as
    { roleId: number; roleName: string; isSuper: number } | undefined
  if (!row) return null
  return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper === 1 }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
