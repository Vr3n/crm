import { ErrorCode, ERROR_CODES } from '../../shared/contracts/errors'
import { PermissionCode } from '../db/permissions'

/**
 * Base class for all domain/business failures. Every subclass carries a stable
 * machine-readable `code` from the shared catalog (ADR-0006) so the IPC layer
 * can map it without string-matching on messages. Unknown/non-domain errors map
 * to INTERNAL_ERROR at the boundary.
 */
export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(message: string, code: ErrorCode = ERROR_CODES.INTERNAL_ERROR) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

/** A requested resource does not exist (or is not visible to this session). */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.NOT_FOUND)
    this.name = 'NotFoundError'
  }
}

/** A user-supplied value violates a domain rule. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.VALIDATION_ERROR)
    this.name = 'ValidationError'
  }
}

/**
 * The caller is not authenticated (no valid session). Distinct from
 * `ForbiddenError`: an unauthenticated caller must never be reported as
 * PERMISSION_DENIED (known-gap #5).
 */
export class UnauthenticatedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthenticatedError'
  }
}

/**
 * Credential validation failed (login). Reports UNAUTHENTICATED so the renderer
 * treats "wrong password" and "not signed in" as the same branch.
 */
export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.UNAUTHENTICATED)
    this.name = 'UnauthorizedError'
  }
}

/** The current session is authenticated but lacks the required permission. */
export class ForbiddenError extends DomainError {
  /** The missing permission code, for logging/debugging. */
  readonly permissionCode: PermissionCode

  constructor(permissionCode: PermissionCode) {
    super(`Missing permission: ${permissionCode}`, ERROR_CODES.PERMISSION_DENIED)
    this.name = 'ForbiddenError'
    this.permissionCode = permissionCode
  }
}

/** An operation conflicts with existing state or data. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.CONFLICT)
    this.name = 'ConflictError'
  }
}

/** A state transition that is illegal for the current entity state. */
export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, ERROR_CODES.INVALID_STATE_TRANSITION)
    this.name = 'InvalidStateTransitionError'
  }
}