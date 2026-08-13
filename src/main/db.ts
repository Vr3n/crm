import { getDb } from './db/connection'

export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  monthlyRevenue: number
  checkinsToday: number
}

export interface Member {
  id: number
  name: string
  email: string
  plan: string
  planPrice: number
  status: string
  joinedAt: string
}

export interface DashboardData {
  stats: DashboardStats
  recentMembers: Member[]
}

const SEED_PLANS = [
  { name: 'Monthly Basic', price: 49 },
  { name: 'Quarterly', price: 129 },
  { name: 'Yearly Elite', price: 429 }
]

const SEED_MEMBERS = [
  { name: 'Aarav Sharma', email: 'aarav@example.com', plan: 'Monthly Basic' },
  { name: 'Priya Patel', email: 'priya@example.com', plan: 'Quarterly' },
  { name: 'Rohan Verma', email: 'rohan@example.com', plan: 'Yearly Elite' },
  { name: 'Sneha Iyer', email: 'sneha@example.com', plan: 'Monthly Basic' },
  { name: 'Kabir Mehta', email: 'kabir@example.com', plan: 'Quarterly' },
  { name: 'Ananya Das', email: 'ananya@example.com', plan: 'Monthly Basic' }
]

/**
 * Demo-only seeding. TODO(Sprint-2): replace with the real Catalog/Offers modules.
 */
export function seedDemoData(): void {
  const db = getDb()

  const planCount = db.prepare('SELECT COUNT(*) AS n FROM plans').get() as { n: number }
  if (planCount.n === 0) {
    const insertPlan = db.prepare('INSERT INTO plans (name, price) VALUES (?, ?)')
    for (const plan of SEED_PLANS) {
      insertPlan.run(plan.name, plan.price)
    }
  }

  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }
  if (memberCount.n === 0) {
    const getPlanId = db.prepare('SELECT id FROM plans WHERE name = ?')
    const insertMember = db.prepare(
      'INSERT INTO members (name, email, plan_id, status, joined_at) VALUES (?, ?, ?, ?, ?)'
    )
    const insertCheckin = db.prepare(
      "INSERT INTO checkins (member_id, checked_in_at) VALUES (?, datetime('now'))"
    )

    for (const m of SEED_MEMBERS) {
      const plan = getPlanId.get(m.plan) as { id: number }
      const joinedAt = new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
      const result = insertMember.run(m.name, m.email, plan.id, 'active', joinedAt)
      insertCheckin.run(Number(result.lastInsertRowid))
    }
  }
}

export function getDashboardData(): DashboardData {
  const db = getDb()

  const stats = {
    totalMembers: (db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n,
    activeMembers: (
      db.prepare("SELECT COUNT(*) AS n FROM members WHERE status = 'active'").get() as {
        n: number
      }
    ).n,
    monthlyRevenue: (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE paid_at >= datetime('now', 'start of month')"
        )
        .get() as { total: number }
    ).total,
    checkinsToday: (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM checkins WHERE checked_in_at >= datetime('now', 'start of day')"
        )
        .get() as { n: number }
    ).n
  }

  const recentMembers = db
    .prepare(
      `SELECT m.id, m.name, m.email, m.status, m.joined_at AS joinedAt, p.name AS plan, p.price AS planPrice
       FROM members m JOIN plans p ON p.id = m.plan_id
       ORDER BY m.joined_at DESC
       LIMIT 6`
    )
    .all() as unknown as Member[]

  return { stats, recentMembers }
}
