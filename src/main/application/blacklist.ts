import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { NotFoundError, ValidationError } from '../domain/errors'
import { personRepo } from '../repositories/sales'
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
