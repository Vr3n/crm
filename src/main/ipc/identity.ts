import { ipcMain } from 'electron'
import {
  setupOrganization,
  login,
  createStaffMember,
  getAuthStatus,
  SetupOrganizationInput,
  LoginInput,
  CreateStaffMemberInput
} from '../application/identity'
import { getSession, setSession } from '../auth/session'
import { SessionContext } from '../domain/identity'

export function registerIdentityIpc(): void {
  ipcMain.handle('identity:setup', (_e, input: SetupOrganizationInput) => setupOrganization(input))

  ipcMain.handle('identity:login', (_e, input: LoginInput) => login(input))

  ipcMain.handle('identity:session', (): SessionContext | null => getSession())

  ipcMain.handle('identity:status', () => getAuthStatus())

  ipcMain.handle('identity:createStaff', (_e, input: CreateStaffMemberInput) =>
    createStaffMember(input)
  )

  ipcMain.handle('identity:logout', () => {
    setSession(null)
    return true
  })
}
