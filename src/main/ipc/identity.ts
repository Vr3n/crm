import {
  setupOrganization,
  login,
  createStaffMember,
  getAuthStatus,
  logout,
  checkOrganizationExists,
  SetupOrganizationInput,
  LoginInput,
  CreateStaffMemberInput,
  OrganizationExistenceInput
} from '../application/identity'
import { getSession } from '../auth/session'
import { SessionContext } from '../domain/identity'
import { handle } from './handle'

export function registerIdentityIpc(): void {
  handle('identity:setup', (input: SetupOrganizationInput) => setupOrganization(input))

  handle('identity:login', (input: LoginInput) => login(input))

  handle('identity:session', (): SessionContext | null => getSession())

  handle('identity:status', () => getAuthStatus())

  handle('identity:createStaff', (input: CreateStaffMemberInput) => createStaffMember(input))

  handle('identity:checkOrganizationExists', (input: OrganizationExistenceInput) =>
    checkOrganizationExists(input)
  )

  handle('identity:logout', () => {
    logout()
    return true
  })
}
