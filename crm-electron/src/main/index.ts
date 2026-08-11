import { app, BrowserWindow, ipcMain } from "electron";
import { initDb } from "./db/connection";
import { createMainWindow } from "./windows/mainWindow";

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName("Crown CRM");

    // Open the db + run migrations BEFORE any window exists.
    const db = await initDb();

    ipcMain.handle("app:version", () => app.getVersion());
    ipcMain.handle("app:dbHealth", () => {
      const count = (
        db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as {
          c: number;
        }
      ).c;
      return {
        ok: true,
        migrations: count,
        dbFile: db.name,
      };
    });

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
