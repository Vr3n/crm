import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { openDatabase } from './db/connection'
import { runMigrations } from './db/migrations'
import { seedPermissions } from './db/seed'
import { registerIdentityIpc } from './ipc/identity'
import { registerSalesIpc } from './ipc/sales'
import { restoreRememberedLogin } from './application/identity'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.gymcrm.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Database foundation: connection -> migrations -> seeds
  openDatabase(join(app.getPath('userData'), 'gym-crm.db'))
  runMigrations()
  seedPermissions()

  // Restore any remembered login BEFORE the window loads, so the renderer's first
  // identity.status() already reports AUTHENTICATED (no login-screen flash).
  // Ordering matters: seedPermissions() must run first because the session context
  // resolves Role -> Permission mappings that live in the seeded permissions table.
  await restoreRememberedLogin()

  // IPC (channels are the only way the renderer touches the database)
  registerIdentityIpc()
  registerSalesIpc()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
