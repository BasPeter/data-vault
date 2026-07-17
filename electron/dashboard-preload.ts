import { contextBridge, ipcRenderer } from "electron";
import type { DashboardApi } from "../src/dashboard-contracts";
import { validatePreloadDashboardState, validatePreloadDocumentIds } from "./dashboard-preload-validation";

const dashboardApi: DashboardApi = Object.freeze({
  getInfo: () => ipcRenderer.invoke("dashboard-api:get-info"),
  readState: () => ipcRenderer.invoke("dashboard-api:read-state"),
  writeState: (state) => {
    validatePreloadDashboardState(state);
    return ipcRenderer.invoke("dashboard-api:write-state", { state });
  },
  readVaultIndex: () => ipcRenderer.invoke("dashboard-api:read-vault-index"),
  readDocuments: (documentIds) => {
    validatePreloadDocumentIds(documentIds);
    return ipcRenderer.invoke("dashboard-api:read-documents", { documentIds });
  },
});

contextBridge.exposeInMainWorld("dashboardApi", dashboardApi);
