import { contextBridge, ipcRenderer } from "electron";
import type { DashboardApi } from "../src/dashboard-contracts";
import {
  validatePreloadDashboardState,
  validatePreloadDocumentIds,
  validatePreloadSecureFetchInput,
} from "./dashboard-preload-validation";

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
  listSecrets: () => ipcRenderer.invoke("dashboard-api:list-secrets"),
  secureFetch: (request) => {
    validatePreloadSecureFetchInput(request);
    return ipcRenderer.invoke("dashboard-api:secure-fetch", { request });
  },
});

contextBridge.exposeInMainWorld("dashboardApi", dashboardApi);
