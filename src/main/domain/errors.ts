import { PermissionCode } from '../db/permissions'

/** Base error for all domain/business failures. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class NotFoundError extends DomainError {}
export class UnauthorizedError extends DomainError {}
export class ValidationError extends DomainError {}

/** Thrown when the current session lacks a required permission. */
export class ForbiddenError extends DomainError {
  readonly code: PermissionCode

  constructor(code: PermissionCode) {
    super(`Missing permission: ${code}`)
    this.name = 'ForbiddenError'
    this.code = code
  }
}
