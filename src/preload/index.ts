import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SessionContext } from '../main/domain/identity'

type IpcResult<T> = { ok: true; data: T } | { ok: false; message: string }

/**
 * Invokes an IPC channel and unwraps the `{ ok, data | message }` envelope.
 * On failure it throws a clean `Error(message)` so the renderer never sees
 * Electron's default serialization (channel name / internal error class).
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res && typeof res === 'object' && 'ok' in res) {
    if (res.ok) return res.data
    throw new Error(res.message)
  }
  return res
}

// Custom APIs for renderer
const api = {
  identity: {
    setup: (input: unknown): Promise<SessionContext> => call('identity:setup', input),
    login: (input: unknown): Promise<SessionContext> => call('identity:login', input),
    session: (): Promise<SessionContext | null> => call('identity:session'),
    status: (): Promise<'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'> =>
      call('identity:status'),
    createStaff: (input: unknown): Promise<{ userId: number }> =>
      call('identity:createStaff', input),
    logout: (): Promise<boolean> => call('identity:logout')
  }
}

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
