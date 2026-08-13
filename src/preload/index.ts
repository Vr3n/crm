import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SessionContext } from '../main/domain/identity'

// Custom APIs for renderer
const api = {
  identity: {
    setup: (input: unknown): Promise<SessionContext> => ipcRenderer.invoke('identity:setup', input),
    login: (input: unknown): Promise<SessionContext> => ipcRenderer.invoke('identity:login', input),
    session: (): Promise<SessionContext | null> => ipcRenderer.invoke('identity:session'),
    status: (): Promise<'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'> =>
      ipcRenderer.invoke('identity:status'),
    createStaff: (input: unknown): Promise<{ userId: number }> =>
      ipcRenderer.invoke('identity:createStaff', input),
    logout: (): Promise<boolean> => ipcRenderer.invoke('identity:logout')
  },
  db: {
    getDashboard: (): Promise<unknown> => ipcRenderer.invoke('db:getDashboard')
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
