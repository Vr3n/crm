import { getDb } from '../db/connection'
import {
  Organization,
  User,
  Role,
  OrganizationStaff,
  OrgStatus,
  UserStatus
} from '../domain/identity'

interface OrgRow {
  id: number
  slug: string
  name: string
  legal_name: string | null
  billing_email: string | null
  mobile_number: string
  timezone: string | null
  currency: string
  status: OrgStatus
  plan_tier: string | null
  created_at: string
}

interface UserRow {
  id: number
  full_name: string
  email: string
  password_hash: string
  status: UserStatus
  created_at: string
}

interface RoleRow {
  id: number
  organization_id: number
  name: string
  is_system_role: number
  is_super: number
  description: string | null
}

interface StaffRow {
  id: number
  organization_id: number
  user_id: number
  role_id: number
  status: OrganizationStaff['status']
  joined_at: string
}

function mapOrg(row: OrgRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legal_name,
    billingEmail: row.billing_email,
    mobileNumber: row.mobile_number,
    timezone: row.timezone,
    currency: row.currency,
    status: row.status,
    planTier: row.plan_tier,
    createdAt: row.created_at
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    createdAt: row.created_at
  }
}

function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    isSystemRole: row.is_system_role === 1,
    isSuper: row.is_super === 1,
    description: row.description
  }
}

function mapStaff(row: StaffRow): OrganizationStaff {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status,
    joinedAt: row.joined_at
  }
}

export const organizationRepo = {
  create(input: {
    slug: string
    name: string
    mobileNumber: string
    legalName?: string | null
    billingEmail?: string | null
    timezone?: string | null
    currency: string
  }): Organization {
    const db = getDb()
    const result = db
      .prepare(
        `INSERT INTO organizations
           (slug, name, mobile_number, legal_name, billing_email, timezone, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.slug,
        input.name,
        input.mobileNumber,
        input.legalName ?? null,
        input.billingEmail ?? null,
        input.timezone ?? null,
        input.currency
      )
    return this.findById(Number(result.lastInsertRowid))!
  },

  findById(id: number): Organization | null {
    const row = getDb().prepare('SELECT * FROM organizations WHERE id = ?').get(id) as
      OrgRow | undefined
    return row ? mapOrg(row) : null
  },

  findAll(): Organization[] {
    const rows = getDb()
      .prepare('SELECT * FROM organizations ORDER BY id')
      .all() as unknown as OrgRow[]
    return rows.map(mapOrg)
  },

  count(): number {
    return (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
  },

  /**
   * True when an organization already exists under this name AND (the given
   * email belongs to its owner/super member OR the given mobile matches the
   * organization's stored mobile). Backs the setup screen's "organization
   * already exists" validation. `email` should be lowercased and `mobile` a
   * bare 10-digit string by the caller. Like other uniqueness rules in this
   * module it is enforced in code, not by a DB constraint.
   */
  existsWithOwnerCredentials(input: { name: string; email: string; mobile: string }): boolean {
    const row = getDb()
      .prepare(
        `SELECT 1 AS x
         FROM organizations o
         WHERE o.name = ?
           AND (
             o.mobile_number = ?
             OR EXISTS (
               SELECT 1
               FROM organization_staff os
               JOIN users u ON u.id = os.user_id
               JOIN roles r ON r.id = os.role_id
               WHERE os.organization_id = o.id
                 AND lower(u.email) = lower(?)
                 AND r.is_super = 1
             )
           )`
      )
      .get(input.name, input.mobile, input.email) as { x: number } | undefined
    return Boolean(row)
  }
}

export const userRepo = {
  create(input: { fullName: string; email: string; passwordHash: string }): User {
    const db = getDb()
    const result = db
      .prepare('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)')
      .run(input.fullName, input.email, input.passwordHash)
    return this.findById(Number(result.lastInsertRowid))!
  },

  findById(id: number): User | null {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row ? mapUser(row) : null
  }
}

export const roleRepo = {
  findByName(organizationId: number, name: string): Role | null {
    const row = getDb()
      .prepare('SELECT * FROM roles WHERE organization_id = ? AND name = ?')
      .get(organizationId, name) as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  /** Resolves the permission codes a role grants. Super roles return all known codes. */
  findPermissionCodes(roleId: number): string[] {
    const db = getDb()
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as RoleRow | undefined
    if (!role) return []
    if (role.is_super === 1) {
      const rows = db.prepare('SELECT code FROM permissions').all() as { code: string }[]
      return rows.map((r) => r.code)
    }
    const rows = db
      .prepare(
        `SELECT p.code
         FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ?`
      )
      .all(roleId) as { code: string }[]
    return rows.map((r) => r.code)
  }
}

/** Simple key/value store for app-level settings (e.g. the remembered login). */
export const appMetaRepo = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      { value: string } | undefined
    return row ? row.value : null
  },

  set(key: string, value: string): void {
    getDb()
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value)
  },

  delete(key: string): void {
    getDb().prepare('DELETE FROM app_meta WHERE key = ?').run(key)
  }
}

export const staffRepo = {
  /** Uniqueness of (organization_id, email) is enforced here, per the spec. */
  emailExistsInOrganization(organizationId: number, email: string): boolean {
    const row = getDb()
      .prepare(
        `SELECT 1 AS x
         FROM organization_staff os
         JOIN users u ON u.id = os.user_id
         WHERE os.organization_id = ? AND lower(u.email) = lower(?)`
      )
      .get(organizationId, email) as { x: number } | undefined
    return Boolean(row)
  },

  create(input: { organizationId: number; userId: number; roleId: number }): OrganizationStaff {
    const db = getDb()
    const result = db
      .prepare(
        'INSERT INTO organization_staff (organization_id, user_id, role_id) VALUES (?, ?, ?)'
      )
      .run(input.organizationId, input.userId, input.roleId)
    return this.findById(Number(result.lastInsertRowid))!
  },

  findById(id: number): OrganizationStaff | null {
    const row = getDb().prepare('SELECT * FROM organization_staff WHERE id = ?').get(id) as
      StaffRow | undefined
    return row ? mapStaff(row) : null
  },

  /** The active staff membership for a user within an organization, with role + user. */
  findActiveForLogin(
    organizationId: number,
    email: string
  ): {
    user: User
    role: Role
  } | null {
    const db = getDb()
    // Explicit aliases: `SELECT u.*, r.*` would collide on shared column names
    // (id, status), silently producing a wrong user/role mapping.
    const row = db
      .prepare(
        `SELECT
           u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email,
           u.password_hash AS u_password_hash, u.status AS u_status, u.created_at AS u_created_at,
           r.id AS r_id, r.organization_id AS r_organization_id, r.name AS r_name,
           r.is_system_role AS r_is_system_role, r.is_super AS r_is_super, r.description AS r_description
         FROM organization_staff os
         JOIN users u ON u.id = os.user_id
         JOIN roles r ON r.id = os.role_id
         WHERE os.organization_id = ?
           AND os.status = 'ACTIVE'
           AND u.status = 'ACTIVE'
           AND lower(u.email) = lower(?)`
      )
      .get(organizationId, email) as
      | {
          u_id: number
          u_full_name: string
          u_email: string
          u_password_hash: string
          u_status: User['status']
          u_created_at: string
          r_id: number
          r_organization_id: number
          r_name: string
          r_is_system_role: number
          r_is_super: number
          r_description: string | null
        }
      | undefined
    if (!row) return null
    return {
      user: {
        id: row.u_id,
        fullName: row.u_full_name,
        email: row.u_email,
        passwordHash: row.u_password_hash,
        status: row.u_status,
        createdAt: row.u_created_at
      },
      role: {
        id: row.r_id,
        organizationId: row.r_organization_id,
        name: row.r_name,
        isSystemRole: row.r_is_system_role === 1,
        isSuper: row.r_is_super === 1,
        description: row.r_description
      }
    }
  },

  /**
   * The ACTIVE membership for a specific (organization, user) pair — used to
   * restore a remembered login. One joined query: it only returns a row when the
   * organization, the user, AND the membership are all ACTIVE. A single query
   * avoids the TOCTOU gap of separate lookups and degrades gracefully to `null`
   * whether a row is disabled or deleted outright.
   */
  findActiveMembership(
    organizationId: number,
    userId: number
  ): {
    roleId: number
    roleName: string
    isSuper: boolean
  } | null {
    const row = getDb()
      .prepare(
        `SELECT r.id AS roleId, r.name AS roleName, r.is_super AS isSuper
         FROM organization_staff os
         JOIN users u ON u.id = os.user_id
         JOIN roles r ON r.id = os.role_id
         JOIN organizations o ON o.id = os.organization_id
         WHERE os.organization_id = ?
           AND os.user_id = ?
           AND os.status = 'ACTIVE'
           AND u.status = 'ACTIVE'
           AND o.status = 'ACTIVE'`
      )
      .get(organizationId, userId) as
      { roleId: number; roleName: string; isSuper: number } | undefined
    if (!row) return null
    return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper === 1 }
  }
}
