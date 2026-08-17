import { defineRelations } from 'drizzle-orm'
import {
  appMeta,
  organizationStaff,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
} from './identity'

export * from './identity'

/**
 * The combined schema object passed to `drizzle()`. Future modules add their
 * tables here (people, catalog, sales, membership, billing, finance, ops).
 */
export const schema = {
  appMeta,
  organizationStaff,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
}

/**
 * Relational config for the identity tables. Declared for schema completeness
 * and future relational queries; repositories query with explicit joins via the
 * Drizzle select builder (never `db.query.*`), per the ORM conventions.
 */
export const relations = defineRelations(schema, (helpers) => ({
  organizations: {
    roles: helpers.many.roles({
      from: helpers.organizations.id,
      to: helpers.roles.organization_id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.organizations.id,
      to: helpers.organizationStaff.organization_id
    })
  },
  users: {
    staff: helpers.many.organizationStaff({
      from: helpers.users.id,
      to: helpers.organizationStaff.user_id
    })
  },
  roles: {
    organization: helpers.one.organizations({
      from: helpers.roles.organization_id,
      to: helpers.organizations.id
    }),
    staff: helpers.many.organizationStaff({
      from: helpers.roles.id,
      to: helpers.organizationStaff.role_id
    }),
    permissions: helpers.many.rolePermissions({
      from: helpers.roles.id,
      to: helpers.rolePermissions.role_id
    })
  },
  permissions: {
    roles: helpers.many.rolePermissions({
      from: helpers.permissions.id,
      to: helpers.rolePermissions.permission_id
    })
  },
  rolePermissions: {
    role: helpers.one.roles({
      from: helpers.rolePermissions.role_id,
      to: helpers.roles.id
    }),
    permission: helpers.one.permissions({
      from: helpers.rolePermissions.permission_id,
      to: helpers.permissions.id
    })
  },
  organizationStaff: {
    organization: helpers.one.organizations({
      from: helpers.organizationStaff.organization_id,
      to: helpers.organizations.id
    }),
    user: helpers.one.users({
      from: helpers.organizationStaff.user_id,
      to: helpers.users.id
    }),
    role: helpers.one.roles({
      from: helpers.organizationStaff.role_id,
      to: helpers.roles.id
    })
  }
}))