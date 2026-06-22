import { contextBridge, ipcRenderer } from "electron";
import type { VaultApi } from "../src/types";

const api: VaultApi = {
  platform: process.platform,
  list: () => ipcRenderer.invoke("vault:list"),
  chooseLocal: () => ipcRenderer.invoke("vault:choose-local"),
  clone: (url) => ipcRenderer.invoke("vault:clone", url),
  createEmpty: (name) => ipcRenderer.invoke("vault:create-empty", name),
  updateVault: (vaultId, update) => ipcRenderer.invoke("vault:update", vaultId, update),
  manifest: (vaultId) => ipcRenderer.invoke("vault:manifest", vaultId),
  document: (vaultId, documentId) => ipcRenderer.invoke("vault:document", vaultId, documentId),
  blame: (vaultId, documentId) => ipcRenderer.invoke("vault:blame", vaultId, documentId),
  quickNotes: (vaultId) => ipcRenderer.invoke("vault:quick-notes", vaultId),
  saveQuickNotes: (vaultId, html) => ipcRenderer.invoke("vault:save-quick-notes", vaultId, html),
  graph: (vaultId) => ipcRenderer.invoke("vault:graph", vaultId),
  sync: (vaultId) => ipcRenderer.invoke("vault:sync", vaultId),
  updateStatus: () => ipcRenderer.invoke("app:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  setTitleBarTheme: (theme) => ipcRenderer.invoke("app:set-title-bar-theme", theme),
  onUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status);
    ipcRenderer.on("app:update-status", handler);
    return () => ipcRenderer.removeListener("app:update-status", handler);
  },
  skillStatus: () => ipcRenderer.invoke("skill:status"),
  installSkills: () => ipcRenderer.invoke("skill:install"),
};

contextBridge.exposeInMainWorld("vaultApi", api);
