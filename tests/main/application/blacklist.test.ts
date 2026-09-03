import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { createLead } from '../../../src/main/application/leads'
import { sellMembership } from '../../../src/main/application/memberships'
import { blacklistPerson, unblacklistPerson } from '../../../src/main/application/blacklist'
import { getDrizzle } from '../../../src/main/db/connection'
import { memberships, people, membershipPlans } from '../../../src/main/db/schema'
import {
  BlacklistedPersonError,
  ValidationError,
  ForbiddenError
} from '../../../src/main/domain/errors'
import { setSession } from '../../../src/main/auth/session'
import { roleRepo } from '../../../src/main/repositories/identity'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'
import type { SessionContext } from '../../../src/main/domain/identity'

setupSalesDb()

function createLeadForSale(): { organizationId: number; leadId: number; personId: number } {
  const { organizationId } = seedOrgWithSession()
  const lead = createLead({
    fullName: 'Blacklist Test Customer',
    phone: '9876543210',
    sourceId: 1
  })
  return { organizationId, leadId: lead.leadId, personId: lead.personId }
}

function saleInput(leadId: number, transactionId: string): SellMembershipInput {
  const plan = getDrizzle()
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(eq(membershipPlans.name, 'Monthly'))
    .get()!
  return {
    leadId,
    planId: plan.id,
    offerId: null,
    joiningDate: '2026-08-25',
    startDate: '2026-08-25',
    endDate: '2026-11-22',
    basePriceMinor: 150_000,
    discountType: 'NONE' as const,
    discountValueMinor: null,
    paidAmountMinor: 50_000,
    paymentMethod: 'UPI' as const,
    transactionId
  }
}

describe('blacklistPerson', () => {
  it('blacklists a person and records reason, timestamp, and user', () => {
    const { personId } = createLeadForSale()
    const result = blacklistPerson({ personId, reason: 'Bad behavior' })

    expect(result.personId).toBe(personId)
    expect(result.isBlacklisted).toBe(true)

    const db = getDrizzle()
    const person = db.select().from(people).where(eq(people.id, personId)).get()!
    expect(person.is_blacklisted).toBe(true)
    expect(person.blacklisted_reason).toBe('Bad behavior')
    expect(person.blacklisted_at).toBeTruthy()
    expect(person.blacklisted_by).toBeGreaterThan(0)
  })

  it('rejects blacklisting an already blacklisted person', () => {
    const { personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'First' })
    expect(() => blacklistPerson({ personId, reason: 'Second' })).toThrow(ValidationError)
  })

  it('rejects blacklisting a non-existent person', () => {
    expect(() => blacklistPerson({ personId: 99999, reason: 'test' })).toThrow()
  })

  it('rejects blacklisting without person.blacklist permission', () => {
    const { organizationId, personId } = createLeadForSale()
    const role = roleRepo.findByName(organizationId, 'Front Desk')!
    const session: SessionContext = {
      organizationId,
      organizationSlug: 'test',
      organizationName: 'Test',
      userId: 1,
      userFullName: 'Test',
      userEmail: 'test@test.com',
      roleId: role.id,
      roleName: role.name,
      isSuper: role.isSuper,
      permissions: []
    }
    setSession(session)
    expect(() => blacklistPerson({ personId, reason: 'test' })).toThrow(ForbiddenError)
  })
})

describe('unblacklistPerson', () => {
  it('unblacklists a blacklisted person and clears all fields', () => {
    const { personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'test' })
    const result = unblacklistPerson({ personId })

    expect(result.personId).toBe(personId)
    expect(result.isBlacklisted).toBe(false)

    const db = getDrizzle()
    const person = db.select().from(people).where(eq(people.id, personId)).get()!
    expect(person.is_blacklisted).toBe(false)
    expect(person.blacklisted_reason).toBeNull()
    expect(person.blacklisted_at).toBeNull()
    expect(person.blacklisted_by).toBeNull()
  })

  it('rejects unblacklisting a person who is not blacklisted', () => {
    const { personId } = createLeadForSale()
    expect(() => unblacklistPerson({ personId })).toThrow(ValidationError)
  })
})

describe('blacklist enforcement in sellMembership', () => {
  it('blocks membership sale to a blacklisted person', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      sellMembership(saleInput(leadId, '00000000-0000-4000-8000-000000000010'))
    ).toThrow(BlacklistedPersonError)

    const db = getDrizzle()
    expect(db.select().from(memberships).all()).toHaveLength(0)
  })

  it('allows membership sale after blacklist is lifted', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'test' })
    unblacklistPerson({ personId })

    const result = sellMembership(
      saleInput(leadId, '00000000-0000-4000-8000-000000000011')
    )
    expect(result.membershipId).toBeGreaterThan(0)
  })
})
