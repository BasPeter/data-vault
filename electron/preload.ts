import { contextBridge, ipcRenderer } from "electron";
import type { VaultApi } from "../src/types";

const api: VaultApi = {
  list: () => ipcRenderer.invoke("vault:list"),
  chooseLocal: () => ipcRenderer.invoke("vault:choose-local"),
  clone: (url) => ipcRenderer.invoke("vault:clone", url),
  manifest: (vaultId) => ipcRenderer.invoke("vault:manifest", vaultId),
  document: (vaultId, documentId) => ipcRenderer.invoke("vault:document", vaultId, documentId),
  graph: (vaultId) => ipcRenderer.invoke("vault:graph", vaultId),
  sync: (vaultId) => ipcRenderer.invoke("vault:sync", vaultId),
};

contextBridge.exposeInMainWorld("vaultApi", api);
