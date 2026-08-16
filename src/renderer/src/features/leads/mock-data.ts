import type {
  ActivityTypeKey,
  Lead,
  LeadActivity,
  LeadStageHistoryEntry,
  LostReasonKey,
  NewLeadInput,
  SourceKey,
  StageKey
} from './types'

/**
 * Seeded sample dataset for the frontend-only leads flow.
 *
 * The set intentionally mimics real-world gym data — including the "dirty"
 * kind (CRM hygiene + gym-sales pitfalls from research):
 *   - missing / malformed fields (no phone, no email, email typos, all-zeros)
 *   - placeholder & gamed entries ("Test User", test@test.com)
 *   - inconsistent source labels ("web", "Insta", "Website") & phone formats
 *   - duplicate records (same phone under two names)
 *   - unowned leads (handoff gap) and stale, no-next-action leads
 *   - a no-show, overdue follow-ups, a long negotiation, lost reasons
 *     (Too expensive / Joined competitor), and recently won (converted) leads
 * All timestamps are relative to "now" so date-range filters feel live.
 */

const h = (n: number): string => new Date(Date.now() - n).toISOString()
const f = (n: number): string => new Date(Date.now() + n).toISOString()

interface SeedLead {
  id: string
  name: string
  phone?: string
  email?: string
  source: SourceKey
  sourceLabel: string
  ownerId?: string
  planInterest?: string
  goal?: string
  stage: StageKey
  createdHoursAgo: number
  notes?: string
  lostReason?: LostReasonKey
  lostHoursAgo?: number
  convertedHoursAgo?: number
  acts: [ActivityTypeKey, string, number?][]
  followUps: [string, number, string?][] // [title, hoursFromNow, note?]
  /** forced override of the NEW → ... → stage trail */
  path?: StageKey[]
}

const STAFF: Record<string, { id: string; name: string }> = {
  priya: { id: 'u-1', name: 'Priya Verma' },
  arjun: { id: 'u-2', name: 'Arjun Mehta' },
  sana: { id: 'u-3', name: 'Sana Shaikh' }
}

function build(seed: SeedLead): Lead {
  const activities: LeadActivity[] = []
  const stageHistory: LeadStageHistoryEntry[] = []

  const createdAt = h(seed.createdHoursAgo)

  // Build the stage path ending at the current stage.
  const path = seed.path ?? ['NEW']
  const arriveAt = (hoursAgo: number): string => h(Math.max(0, seed.createdHoursAgo - hoursAgo))
  let arrived = createdAt
  path.forEach((to, i) => {
    const from = i > 0 ? path[i - 1] : undefined
    if (i === path.length - 1 && seed.stage === to) {
      // final arrival is "now" (present state)
      arrived = h(2)
    } else {
      arrived = arriveAt(0)
    }
    stageHistory.push({ from, to, at: arrived, by: seed.ownerId ? STAFF[seed.ownerId].name : undefined })
  })
  // Stage-change activity for each transition.
  for (let i = 1; i < path.length; i++) {
    activities.push({
      id: `${seed.id}-act-stage-${i}`,
      leadId: seed.id,
      type: 'STAGE_CHANGE',
      note: `Moved to ${path[i]}`,
      at: stageHistory[i]!.at,
      by: seed.ownerId ? STAFF[seed.ownerId].name : undefined
    })
  }

  activities.push({
    id: `${seed.id}-act-created`,
    leadId: seed.id,
    type: 'LEAD_CREATED',
    note: seed.goal ? `Goal: ${seed.goal}` : undefined,
    at: createdAt,
    by: seed.ownerId ? STAFF[seed.ownerId].name : undefined
  })

  // The activity feed (newest first).
  seed.acts.forEach(([type, note, hoursAgo], i) => {
    activities.push({
      id: `${seed.id}-act-${i}`,
      leadId: seed.id,
      type,
      note,
      at: h(Math.max(0, seed.createdHoursAgo - (hoursAgo ?? 0))),
      by: seed.ownerId ? STAFF[seed.ownerId].name : undefined
    })
  })

  const followUps = seed.followUps.map(([title, hoursFromNow, note], i) => ({
    id: `${seed.id}-fu-${i}`,
    leadId: seed.id,
    title,
    dueAt: f(hoursFromNow),
    note
  }))

  if (seed.lostReason) {
    activities.push({
      id: `${seed.id}-act-lost`,
      leadId: seed.id,
      type: 'LOST',
      note: seed.lostReason,
      at: h(seed.lostHoursAgo ?? 0),
      by: seed.ownerId ? STAFF[seed.ownerId].name : undefined
    })
  }
  if (seed.convertedHoursAgo !== undefined) {
    activities.push({
      id: `${seed.id}-act-won`,
      leadId: seed.id,
      type: 'WON',
      note: 'Converted to membership',
      at: h(seed.convertedHoursAgo),
      by: seed.ownerId ? STAFF[seed.ownerId].name : undefined
    })
  }

  return {
    id: seed.id,
    name: seed.name,
    phone: seed.phone,
    email: seed.email,
    source: seed.source,
    sourceLabel: seed.sourceLabel,
    owner: seed.ownerId ? STAFF[seed.ownerId] : undefined,
    planInterest: seed.planInterest,
    goal: seed.goal,
    stage: seed.stage,
    createdAt,
    notes: seed.notes,
    lostReason: seed.lostReason,
    lostAt: seed.lostReason ? h(seed.lostHoursAgo ?? 0) : undefined,
    convertedAt: seed.convertedHoursAgo !== undefined ? h(seed.convertedHoursAgo) : undefined,
    activities,
    followUps,
    stageHistory
  }
}

export const SEED_LEADS: Lead[] = [
  build({
    id: 'L-001',
    name: 'Rahul Sharma',
    phone: '98200 12345',
    source: 'WALK_IN',
    sourceLabel: 'Walk-in',
    ownerId: 'priya',
    planInterest: 'Annual Premium',
    goal: 'Weight loss',
    stage: 'NEW',
    createdHoursAgo: 44,
    path: ['NEW'],
    acts: [],
    followUps: [['Call re Annual Premium', 4, 'Asked about pool access']]
  }),
  build({
    id: 'L-002',
    name: 'Test User',
    phone: '0000000000',
    email: 'test@test.com',
    source: 'WEBSITE',
    sourceLabel: 'web',
    stage: 'CONTACTED',
    createdHoursAgo: 6,
    path: ['NEW', 'CONTACTED'],
    acts: [['NOTE', 'good call']],
    followUps: []
  }),
  build({
    id: 'L-003',
    name: 'Priyanka Jain',
    phone: '+91 98200 11223',
    email: 'priyanka.jain@gmail.con',
    source: 'INSTAGRAM',
    sourceLabel: 'Insta',
    ownerId: 'arjun',
    planInterest: 'Monthly Premium',
    goal: 'Toning',
    stage: 'INTERESTED',
    createdHoursAgo: 120,
    path: ['NEW', 'CONTACTED', 'INTERESTED'],
    acts: [
      ['WHATSAPP', 'Saw her Instagram story, sent DM', 72],
      ['PHONE_CALL', 'Wants to try a Zumba class first', 48]
    ],
    followUps: [['Send class schedule', 30]]
  }),
  build({
    id: 'L-004',
    name: 'Mohammed Imran',
    phone: '98200 44556',
    email: 'imran.m@gmail.com',
    source: 'WEBSITE',
    sourceLabel: 'Website',
    ownerId: 'sana',
    planInterest: 'Monthly Basic',
    goal: 'Muscle gain',
    stage: 'VISIT_SCHEDULED',
    createdHoursAgo: 190,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED'],
    acts: [
      ['PHONE_CALL', 'Booked tour for Saturday', 100],
      ['WHATSAPP', 'Sent confirmation', 96]
    ],
    followUps: [['Confirm gym tour', -60, 'He never confirmed; follow up']]
  }),
  build({
    id: 'L-005',
    name: 'Aisha Khan',
    phone: '098200-77889',
    source: 'REFERRAL',
    sourceLabel: 'Referral',
    ownerId: 'priya',
    planInterest: 'Quarterly Premium',
    goal: 'Post-natal fitness',
    stage: 'VISITED',
    createdHoursAgo: 290,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED'],
    acts: [
      ['GYM_TOUR', 'Loved the pool and group classes', 110],
      ['PHONE_CALL', 'Asked about quarterly pricing', 90]
    ],
    followUps: [['Send annual plan quote', 90]]
  }),
  build({
    id: 'L-006',
    name: 'Rohan Patel',
    phone: '98200 33445',
    email: 'rohan.patel@gmail.com',
    source: 'WALK_IN',
    sourceLabel: 'Walk-in',
    ownerId: 'arjun',
    planInterest: 'Monthly Premium',
    goal: 'Strength',
    stage: 'TRIAL',
    createdHoursAgo: 330,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL'],
    acts: [
      ['GYM_TOUR', 'Full tour', 200],
      ['TRIAL', 'Completed a free group class', 24],
      ['MEMBERSHIP_PROPOSAL', 'Shared Monthly Premium offer', 12]
    ],
    followUps: [['Post-trial offer follow-up', 20]]
  }),
  build({
    id: 'L-007',
    name: 'Sneha Reddy',
    phone: '98200 55667',
    email: 'sneha.reddy@gmail.com',
    source: 'MEMBER_REFERRAL',
    sourceLabel: 'Existing member referral',
    ownerId: 'sana',
    planInterest: 'Annual Unlimited',
    goal: 'Yoga + strength',
    stage: 'NEGOTIATION',
    createdHoursAgo: 380,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL', 'NEGOTIATION'],
    acts: [
      ['TRIAL', 'Referred by current member', 170],
      ['PRICE_DISCUSSION', 'Wants a slight discount for annual', 60]
    ],
    followUps: [['Share final discounted offer', 48]]
  }),
  build({
    id: 'L-008',
    name: 'Vikram Singh',
    phone: '+91 98200 99887',
    email: 'vikram.singh@gmail.com',
    source: 'PHONE',
    sourceLabel: 'Phone',
    ownerId: 'priya',
    planInterest: 'Annual Premium',
    stage: 'NEGOTIATION',
    createdHoursAgo: 430,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL', 'NEGOTIATION'],
    acts: [
      ['TRIAL', 'Did two trial classes', 210],
      ['PRICE_DISCUSSION', 'Thinks ₹24k/year is steep, wants instalments', 140]
    ],
    followUps: [['Revisit price with instalment option', -110]]
  }),
  build({
    id: 'L-009',
    name: 'Kavita Nair',
    phone: '98200 66778',
    source: 'WEBSITE',
    sourceLabel: 'Web',
    planInterest: 'Couple Annual',
    goal: 'Wants a couple plan',
    stage: 'VISIT_SCHEDULED',
    createdHoursAgo: 470,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED'],
    acts: [
      ['NO_SHOW', 'Booked trial but did not show up', 150],
      ['PHONE_CALL', 'Said she will reschedule', 130]
    ],
    followUps: [['Reschedule couple trial', -30]]
  }),
  build({
    id: 'L-010',
    name: 'Farhan Ali',
    phone: '98200 11122',
    source: 'WHATSAPP',
    sourceLabel: 'WhatsApp',
    planInterest: 'Student Monthly',
    goal: 'Budget cardio',
    stage: 'NEW',
    createdHoursAgo: 3,
    path: ['NEW'],
    acts: [],
    followUps: [['WhatsApp pricing for student plan', 70]]
  }),
  build({
    id: 'L-011',
    name: 'Meera Iyer',
    phone: '98200 77889',
    email: 'meera.iyer@gmail.com',
    source: 'WALK_IN',
    sourceLabel: 'Walk-in',
    ownerId: 'arjun',
    planInterest: 'Monthly Premium',
    stage: 'LOST',
    createdHoursAgo: 520,
    lostReason: 'TOO_EXPENSIVE',
    lostHoursAgo: 70,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL', 'NEGOTIATION', 'LOST'],
    acts: [
      ['TRIAL', 'Trial done', 280],
      ['PRICE_DISCUSSION', 'Could not match competitor rate', 200],
      ['MEMBERSHIP_PROPOSAL', 'Final offer declined', 80]
    ],
    followUps: []
  }),
  build({
    id: 'L-012',
    name: 'Karan Malhotra',
    phone: '98200 99001',
    source: 'REFERRAL',
    sourceLabel: 'Referral',
    ownerId: 'sana',
    planInterest: 'Quarterly Premium',
    stage: 'LOST',
    createdHoursAgo: 640,
    lostReason: 'JOINED_COMPETITOR',
    lostHoursAgo: 210,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'LOST'],
    acts: [['NOTE', 'Joined a nearby gym at a lower intro rate', 220]],
    followUps: []
  }),
  build({
    id: 'L-013',
    name: 'Neha Gupta',
    phone: '98200 22334',
    email: 'neha.gupta@gmail.com',
    source: 'INSTAGRAM',
    sourceLabel: 'Instagram',
    ownerId: 'priya',
    planInterest: 'Annual Premium',
    goal: 'Marathon prep',
    stage: 'WON',
    createdHoursAgo: 700,
    convertedHoursAgo: 140,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL', 'NEGOTIATION', 'WON'],
    acts: [
      ['TRIAL', 'Completed PT trial', 400],
      ['MEMBERSHIP_PROPOSAL', 'Locked annual rate', 160]
    ],
    followUps: []
  }),
  build({
    id: 'L-014',
    name: 'Amit Desai',
    phone: '98200 66554',
    source: 'WEBSITE',
    sourceLabel: 'Website',
    ownerId: 'arjun',
    planInterest: 'Monthly Basic',
    stage: 'WON',
    createdHoursAgo: 920,
    convertedHoursAgo: 360,
    path: ['NEW', 'CONTACTED', 'INTERESTED', 'VISIT_SCHEDULED', 'VISITED', 'TRIAL', 'WON'],
    acts: [
      ['TRIAL', 'Two trial classes', 520],
      ['MEMBERSHIP_PROPOSAL', 'Took monthly basic', 380]
    ],
    followUps: []
  }),
  build({
    id: 'L-015',
    name: 'Rahul S.',
    phone: '98200 12345',
    email: 'rahul.sharma@gmail.com',
    source: 'WEBSITE',
    sourceLabel: 'Website',
    planInterest: 'Monthly Premium',
    stage: 'INTERESTED',
    createdHoursAgo: 26,
    path: ['NEW', 'CONTACTED', 'INTERESTED'],
    acts: [['WHATSAPP', 'Enquired about a different plan']],
    followUps: [['Call to clarify plans', 12]]
  })
]

/** In-memory store; seeded once. Mutations are transient (reload resets). */
export class LeadStore {
  leads: Lead[] = SEED_LEADS.map((l) => structuredClone(l))
  private seq = 1000

  all(): Lead[] {
    return structuredClone(this.leads)
  }

  byId(id: string): Lead | undefined {
    const found = this.leads.find((l) => l.id === id)
    return found ? structuredClone(found) : undefined
  }

  private nextId(): string {
    return `L-${this.seq++}`
  }

  create(input: NewLeadInput, actor: string): Lead {
    const now = new Date().toISOString()
    const id = this.nextId()
    const lead: Lead = {
      id,
      name: input.name.trim(),
      phone: input.phone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      source: input.source,
      sourceLabel: input.source,
      owner: input.ownerId ? STAFF[input.ownerId] : undefined,
      planInterest: input.planInterest?.trim() || undefined,
      goal: input.goal?.trim() || undefined,
      stage: 'NEW',
      createdAt: now,
      notes: input.notes?.trim() || undefined,
      activities: [
        {
          id: `${this.nextId()}-act-0`,
          leadId: id,
          type: 'LEAD_CREATED',
          note: input.goal ? `Goal: ${input.goal}` : undefined,
          at: now,
          by: actor
        }
      ],
      followUps: [],
      stageHistory: [{ from: undefined, to: 'NEW', at: now, by: actor }]
    }
    this.leads.unshift(lead)
    return structuredClone(lead)
  }

  moveStage(id: string, to: StageKey, note: string, actor: string): Lead {
    const lead = this.leads.find((l) => l.id === id)!
    const now = new Date().toISOString()
    lead.stageHistory.push({ from: lead.stage, to, at: now, by: actor })
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: id,
      type: 'STAGE_CHANGE',
      note: note || `Moved to ${to}`,
      at: now,
      by: actor
    })
    lead.stage = to
    return structuredClone(lead)
  }

  logActivity(id: string, type: ActivityTypeKey, note: string, actor: string): Lead {
    const lead = this.leads.find((l) => l.id === id)!
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: id,
      type,
      note: note || undefined,
      at: new Date().toISOString(),
      by: actor
    })
    return structuredClone(lead)
  }

  addFollowUp(id: string, title: string, dueAt: string, note: string | undefined, actor: string): Lead {
    const lead = this.leads.find((l) => l.id === id)!
    lead.followUps.push({
      id: `${this.nextId()}-fu`,
      leadId: id,
      title: title.trim(),
      dueAt,
      note
    })
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: id,
      type: 'FOLLOW_UP_CREATED',
      note: title.trim(),
      at: new Date().toISOString(),
      by: actor
    })
    return structuredClone(lead)
  }

  completeFollowUp(followUpId: string, actor: string): Lead {
    const fu = this.leads.flatMap((l) => l.followUps).find((f) => f.id === followUpId)!
    fu.completedAt = new Date().toISOString()
    const lead = this.leads.find((l) => l.id === fu.leadId)!
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: fu.leadId,
      type: 'FOLLOW_UP_DONE',
      note: fu.title,
      at: fu.completedAt,
      by: actor
    })
    return structuredClone(lead)
  }

  markLost(id: string, reason: LostReasonKey, note: string, actor: string): Lead {
    const lead = this.leads.find((l) => l.id === id)!
    const now = new Date().toISOString()
    lead.lostReason = reason
    lead.lostAt = now
    lead.stage = 'LOST'
    lead.stageHistory.push({ from: lead.stage, to: 'LOST', at: now, by: actor })
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: id,
      type: 'LOST',
      note: note || reason,
      at: now,
      by: actor
    })
    return structuredClone(lead)
  }

  convert(id: string, actor: string): Lead {
    const lead = this.leads.find((l) => l.id === id)!
    const now = new Date().toISOString()
    lead.convertedAt = now
    lead.stage = 'WON'
    lead.stageHistory.push({ from: lead.stage, to: 'WON', at: now, by: actor })
    lead.activities.push({
      id: `${this.nextId()}-act`,
      leadId: id,
      type: 'WON',
      note: 'Converted to membership',
      at: now,
      by: actor
    })
    return structuredClone(lead)
  }
}