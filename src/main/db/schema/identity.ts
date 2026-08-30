import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/**
 * Identity & tenancy schema (foundation). Mirrors the shipped migration
 * `identity_tenancy` + `app_meta` exactly: column names, nullability, defaults,
 * unique constraints, and indexes are the source of truth that the generated
 * `0000_identity` migration is created from, and that existing databases are
 * reconciled against at startup.
 */

export const organizations = sqliteTable('organizations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  legal_name: text('legal_name'),
  billing_email: text('billing_email'),
  mobile_number: text('mobile_number').notNull(),
  timezone: text('timezone'),
  currency: text('currency').notNull().default('INR'),
  org_invoice_prefix: text('org_invoice_prefix'),
  logo: text('logo'),
  address: text('address'),
  gstin: text('gstin'),
  status: text('status').notNull().default('ACTIVE'),
  plan_tier: text('plan_tier'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`)
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  full_name: text('full_name').notNull(),
  email: text('email').notNull(),
  password_hash: text('password_hash').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`)
})

export const roles = sqliteTable(
  'roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    is_system_role: integer('is_system_role', { mode: 'boolean' }).notNull().default(false),
    is_super: integer('is_super', { mode: 'boolean' }).notNull().default(false),
    description: text('description')
  },
  (table) => [unique().on(table.organization_id, table.name)]
)

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description')
})

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission_id: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })]
)

export const organizationStaff = sqliteTable(
  'organization_staff',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id),
    status: text('status').notNull().default('ACTIVE'),
    joined_at: text('joined_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.user_id),
    index('idx_staff_org').on(table.organization_id),
    index('idx_staff_user').on(table.user_id)
  ]
)

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
