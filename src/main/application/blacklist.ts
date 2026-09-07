import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { NotFoundError, ValidationError } from '../domain/errors'
import { followupRepo, personRepo } from '../repositories/sales'
import type {
  BlacklistPersonInput,
  BlacklistPersonResult,
  UnblacklistPersonInput
} from '../../shared/contracts/blacklist'

export function blacklistPerson(input: BlacklistPersonInput): BlacklistPersonResult {
  requirePermission(PERMISSIONS.PERSON_BLACKLIST)
  const organizationId = currentOrganizationId()
  const session = requireSession()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (person.isBlacklisted) {
    throw new ValidationError('Person is already blacklisted')
  }

  personRepo.blacklist(organizationId, input.personId, input.reason, session.userId)

  // Cancel all pending follow-ups for this person's leads
  const reason = input.reason?.trim()
    ? `Blacklisted: ${input.reason} — follow-up cancelled`
    : 'Follow-up cancelled — person has been blacklisted'
  const pendingFollowups = followupRepo.listPendingForPerson(organizationId, input.personId)
  for (const fu of pendingFollowups) {
    followupRepo.cancel(organizationId, fu.id, session.userId, reason)
  }

  return { personId: input.personId, isBlacklisted: true }
}

export function unblacklistPerson(input: UnblacklistPersonInput): BlacklistPersonResult {
  requirePermission(PERMISSIONS.PERSON_BLACKLIST)
  const organizationId = currentOrganizationId()

  const person = personRepo.findById(organizationId, input.personId)
  if (!person) throw new NotFoundError('Person not found')

  if (!person.isBlacklisted) {
    throw new ValidationError('Person is not blacklisted')
  }

  personRepo.unblacklist(organizationId, input.personId)

  return { personId: input.personId, isBlacklisted: false }
}
