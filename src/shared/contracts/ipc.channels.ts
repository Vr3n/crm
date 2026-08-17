/**
 * The single source of truth for IPC channel names, imported by both the main
 * process (`src/main/ipc/*`) and the preload bridge. Never hard-code a channel
 * string in a handler or the renderer client.
 */
export const IPC_CHANNELS = {
  IDENTITY_SETUP: 'identity:setup',
  IDENTITY_LOGIN: 'identity:login',
  IDENTITY_SESSION: 'identity:session',
  IDENTITY_STATUS: 'identity:status',
  IDENTITY_CREATE_STAFF: 'identity:createStaff',
  IDENTITY_CHECK_ORGANIZATION_EXISTS: 'identity:checkOrganizationExists',
  IDENTITY_LOGOUT: 'identity:logout'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]