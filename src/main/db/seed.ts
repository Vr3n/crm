import { getDb } from './connection'
import { withTransaction } from './connection'
import { ALL_PERMISSION_CODES } from './permissions'

export interface SeedRole {
  name: string
  is_system: boolean
  is_super: boolean
  permissions: string[]
}

/**
 * The per-organization starter roles, shipped as editable data (not compiled logic).
 * Owner and Admin are the two system roles and are is_super; everything else is
 * ordinary and editable via RolePermission rows.
 */
export const SEED_ROLES: SeedRole[] = [
  { name: 'Owner', is_system: true, is_super: true, permissions: [] },
  { name: 'Admin', is_system: true, is_super: true, permissions: [] },
  {
    name: 'Manager',
    is_system: false,
    is_super: false,
    permissions: ['org.view', 'user.view', 'role.view']
  },
  {
    name: 'Sales',
    is_system: false,
    is_super: false,
    permissions: ['user.view']
  },
  {
    name: 'Front Desk',
    is_system: false,
    is_super: false,
    permissions: ['user.view']
  },
  {
    name: 'Finance',
    is_system: false,
    is_super: false,
    permissions: ['user.view']
  }
]

/**
 * Seeds the global permission catalog once. Call after migrations.
 */
export function seedPermissions(): void {
  const db = getDb()
  const insert = db.prepare('INSERT OR IGNORE INTO permissions (code, description) VALUES (?, ?)')
  for (const code of ALL_PERMISSION_CODES) {
    insert.run(code, null)
  }
}

/**
 * Creates (or idempotently returns) the starter roles for a given organization.
 * Runs inside its own transaction; should be called within the org-setup flow.
 */
export function seedRolesForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDb()

    const insertRole = db.prepare(
      'INSERT INTO roles (organization_id, name, is_system_role, is_super, description) VALUES (?, ?, ?, ?, ?)'
    )
    const linkRolePermission = db.prepare(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)'
    )
    const getPermissionId = db.prepare('SELECT id FROM permissions WHERE code = ?')

    for (const role of SEED_ROLES) {
      const result = insertRole.run(
        organizationId,
        role.name,
        role.is_system ? 1 : 0,
        role.is_super ? 1 : 0,
        null
      )
      const roleId = Number(result.lastInsertRowid)

      for (const code of role.permissions) {
        const perm = getPermissionId.get(code) as { id: number } | undefined
        if (perm) {
          linkRolePermission.run(roleId, perm.id)
        }
      }
    }
  })
}
