import { getDrizzle } from './connection'
import { withTransaction } from './connection'
import { permissions, rolePermissions, roles } from './schema'
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
 * ordinary and editable via RolePermission rows. Non-super grant sets follow the
 * Module 15 worked example, mapped onto the current permission catalog.
 */
export const SEED_ROLES: SeedRole[] = [
  { name: 'Owner', is_system: true, is_super: true, permissions: [] },
  { name: 'Admin', is_system: true, is_super: true, permissions: [] },
  {
    name: 'Manager',
    is_system: false,
    is_super: false,
    permissions: [
      'org.view',
      'user.view',
      'role.view',
      'lead.view',
      'lead.create',
      'lead.assign',
      'lead.record_activity',
      'lead.update_stage',
      'lead.mark_lost',
      'lead.convert',
      'plan.view',
      'plan.create',
      'plan.update',
      'plan.deactivate',
      'offer.view',
      'offer.create',
      'offer.update',
      'offer.deactivate',
      'membership.view',
      'membership.create',
      'membership.activate',
      'membership.freeze',
      'membership.unfreeze',
      'membership.renew',
      'membership.change_plan',
      'membership.request_cancellation',
      'membership.cancel',
      'invoice.view',
      'invoice.create',
      'invoice.finalize',
      'invoice.void',
      'payment.view',
      'payment.record',
      'payment.allocate',
      'refund.view',
      'refund.create',
      'credit.view',
      'credit.create',
      'credit.apply',
      'report.view'
    ]
  },
  {
    name: 'Sales',
    is_system: false,
    is_super: false,
    permissions: [
      'lead.view',
      'lead.create',
      'lead.record_activity',
      'lead.update_stage',
      'lead.convert',
      'plan.view',
      'offer.view',
      'membership.view',
      'membership.create',
      'membership.activate'
    ]
  },
  {
    name: 'Front Desk',
    is_system: false,
    is_super: false,
    permissions: ['lead.view', 'lead.record_activity', 'membership.view']
  },
  {
    name: 'Finance',
    is_system: false,
    is_super: false,
    permissions: [
      'invoice.view',
      'invoice.finalize',
      'invoice.void',
      'payment.view',
      'payment.record',
      'payment.allocate',
      'refund.view',
      'refund.create',
      'credit.view',
      'credit.create',
      'credit.apply',
      'report.view'
    ]
  }
]

/**
 * Seeds the global permission catalog once. Call after migrations. Uses
 * ON CONFLICT DO NOTHING so re-running after a catalog extension is a no-op
 * for codes that already exist (same semantics as the shipped INSERT OR IGNORE).
 */
export function seedPermissions(): void {
  const db = getDrizzle()
  db.insert(permissions)
    .values(ALL_PERMISSION_CODES.map((code) => ({ code, description: null })))
    .onConflictDoNothing()
    .run()
}

/**
 * Creates the starter roles for a given organization. Runs inside its own
 * transaction; should be called within the org-setup flow. Role rows are
 * inserted unconditionally — a second call for the same org violates the
 * (organization_id, name) unique constraint, matching the shipped behavior.
 */
export function seedRolesForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()

    const permissionIds = new Map(
      db.select({ id: permissions.id, code: permissions.code }).from(permissions).all().map(
        (row) => [row.code, row.id]
      )
    )

    for (const role of SEED_ROLES) {
      const inserted = db
        .insert(roles)
        .values({
          organization_id: organizationId,
          name: role.name,
          is_system_role: role.is_system,
          is_super: role.is_super,
          description: null
        })
        .returning({ id: roles.id })
        .get()
      const roleId = inserted.id

      for (const code of role.permissions) {
        const permissionId = permissionIds.get(code)
        if (permissionId === undefined) continue
        db.insert(rolePermissions)
          .values({ role_id: roleId, permission_id: permissionId })
          .onConflictDoNothing()
          .run()
      }
    }
  })
}