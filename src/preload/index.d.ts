import { ElectronAPI } from '@electron-toolkit/preload'

export interface SessionContext {
  organizationId: number
  organizationSlug: string
  organizationName: string
  userId: number
  userFullName: string
  userEmail: string
  roleId: number
  roleName: string
  isSuper: boolean
  permissions: string[]
}

export interface SetupOrganizationInput {
  name: string
  slug?: string
  currency?: string
  timezone?: string
  ownerFullName: string
  ownerEmail: string
  ownerPassword: string
  mobileNumber: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface CreateStaffMemberInput {
  fullName: string
  email: string
  password: string
  roleName: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      identity: {
        setup: (input: SetupOrganizationInput) => Promise<SessionContext>
        login: (input: LoginInput) => Promise<SessionContext>
        session: () => Promise<SessionContext | null>
        status: () => Promise<'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'>
        createStaff: (input: CreateStaffMemberInput) => Promise<{ userId: number }>
        logout: () => Promise<boolean>
      }
    }
  }
}
