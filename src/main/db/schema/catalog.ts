import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations } from './identity'

/**
 * Catalog & Offers schema (Module 03). Reference/lookup data: plans are editable
 * freely because Memberships/Invoices snapshot their commercial terms at sale
 * time (Module 03 §10) — this table is only the *current* pricing catalog.
 *
 * Prices are stored in integer minor units (paise) — never floats (guidelines
 * §10). Plans are NOT inventory: no quantity/stock columns.
 */
export const membershipPlans = sqliteTable(
  'membership_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    /** Membership term: MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY. */
    duration: text('duration').notNull(),
    /** How the plan is billed: ONE_TIME / MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY. */
    billing_frequency: text('billing_frequency').notNull().default('ONE_TIME'),
    /** Base price in paise (integer minor units) — the number that must never change after a sale. */
    base_price_minor: integer('base_price_minor').notNull(),
    /** Facility access window: ALL_HOURS / TIMED. */
    access_window: text('access_window').notNull().default('ALL_HOURS'),
    /** 'HH:MM' when access_window is TIMED. */
    start_time: text('start_time'),
    /** 'HH:MM' when access_window is TIMED. */
    end_time: text('end_time'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_membership_plans_org').on(table.organization_id)
  ]
)
