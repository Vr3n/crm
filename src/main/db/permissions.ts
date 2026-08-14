/**
 * The canonical permission catalog. Every code the Command layer checks lives here.
 * New permissions are added here AND seeded into the database (seed.ts) so that
 * non-super roles can be granted them via RolePermission data.
 *
 * Convention: <domain>.<verb>, e.g. "user.create".
 */
export const PERMISSIONS = {
  // Identity & tenancy (this sprint)
  ORG_VIEW: 'org.view',
  ORG_MANAGE: 'org.manage',
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage'
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_CODES: readonly string[] = Object.values(PERMISSIONS)
