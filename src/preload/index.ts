import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ApiError } from '../shared/contracts/errors'
import type { IpcResult } from '../shared/contracts/errors'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  OrganizationExistenceInput,
  SessionContext,
  SetupOrganizationInput
} from '../shared/contracts/identity'
import { IPC_CHANNELS } from '../shared/contracts/ipc.channels'

/**
 * Invokes an IPC channel and unwraps the `{ ok, data | error }` envelope.
 * On failure it re-throws an `ApiError` carrying the stable machine-readable
 * code from the shared catalog, so the renderer branches on `error.code`
 * (ADR-0006) instead of matching on messages or Electron's serialization.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res && typeof res === 'object' && 'ok' in res) {
    if (res.ok) return res.data
    const { code, message, details } = res.error
    throw new ApiError(code, message, details)
  }
  return res
}

// Custom APIs for renderer
const api = {
  identity: {
    setup: (input: SetupOrganizationInput): Promise<SessionContext> =>
      call(IPC_CHANNELS.IDENTITY_SETUP, input),
    login: (input: LoginInput): Promise<SessionContext> =>
      call(IPC_CHANNELS.IDENTITY_LOGIN, input),
    session: (): Promise<SessionContext | null> => call(IPC_CHANNELS.IDENTITY_SESSION),
    status: (): Promise<AuthStatus> => call(IPC_CHANNELS.IDENTITY_STATUS),
    createStaff: (input: CreateStaffMemberInput): Promise<CreatedStaffMember> =>
      call(IPC_CHANNELS.IDENTITY_CREATE_STAFF, input),
    checkOrganizationExists: (input: OrganizationExistenceInput): Promise<boolean> =>
      call(IPC_CHANNELS.IDENTITY_CHECK_ORGANIZATION_EXISTS, input),
    logout: (): Promise<boolean> => call(IPC_CHANNELS.IDENTITY_LOGOUT)
  }
}

export type RendererApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}