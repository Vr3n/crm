import { contextBridge, ipcRenderer } from "electron";
import type { ApiEnvelope, DbHealth } from "../common/contract";

const api = {
  app: {
    dbHealth: (): Promise<ApiEnvelope<DbHealth>> =>
      ipcRenderer.invoke("app:dbHealth"),
    version: (): Promise<string> => ipcRenderer.invoke("app:version"),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
