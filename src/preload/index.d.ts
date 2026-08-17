import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  OrganizationExistenceInput,
  SessionContext,
  SetupOrganizationInput
} from '../shared/contracts/identity'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      identity: {
        setup: (input: SetupOrganizationInput) => Promise<SessionContext>
        login: (input: LoginInput) => Promise<SessionContext>
        session: () => Promise<SessionContext | null>
        status: () => Promise<AuthStatus>
        createStaff: (input: CreateStaffMemberInput) => Promise<CreatedStaffMember>
        checkOrganizationExists: (input: OrganizationExistenceInput) => Promise<boolean>
        logout: () => Promise<boolean>
      }
    }
  }
}