import { contextBridge, ipcRenderer } from "electron";
import type { OpenCodeStreamDelivery, VaultApi } from "../src/types";

const OPEN_CODE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function isOpenCodeStreamDelivery(value: unknown): value is OpenCodeStreamDelivery {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const delivery = value as Record<string, unknown>;
  if (!Number.isSafeInteger(delivery.generation) || (delivery.generation as number) < 1) return false;
  if (!Number.isSafeInteger(delivery.sequence) || (delivery.sequence as number) < 1) return false;
  if (delivery.kind === "delta") {
    return (
      typeof delivery.sessionId === "string" &&
      OPEN_CODE_ID.test(delivery.sessionId) &&
      typeof delivery.messageId === "string" &&
      OPEN_CODE_ID.test(delivery.messageId) &&
      typeof delivery.text === "string" &&
      delivery.text.length >= 1 &&
      delivery.text.length <= 8_000
    );
  }
  return (
    delivery.kind === "control" &&
    (delivery.state === "connected" ||
      delivery.state === "reconnecting" ||
      delivery.state === "terminal" ||
      delivery.state === "polling-fallback" ||
      delivery.state === "ready")
  );
}

export const api: VaultApi = {
  platform: process.platform,
  openCodeSetup: (input) => ipcRenderer.invoke("opencode:setup", input),
  removeOpenCodeSetup: () => ipcRenderer.invoke("opencode:remove-setup"),
  openCodeStatus: (sessionId) => ipcRenderer.invoke("opencode:status", sessionId),
  listOpenCodeSessions: () => ipcRenderer.invoke("opencode:list-sessions"),
  createOpenCodeSession: (title) => ipcRenderer.invoke("opencode:create-session", title),
  listOpenCodeMessages: (sessionId) => ipcRenderer.invoke("opencode:list-messages", sessionId),
  sendOpenCodePrompt: (sessionId, prompt) => ipcRenderer.invoke("opencode:send-prompt", sessionId, prompt),
  abortOpenCodePrompt: (sessionId) => ipcRenderer.invoke("opencode:abort-prompt", sessionId),
  startOpenCodeStream: () => ipcRenderer.invoke("opencode:stream:start"),
  stopOpenCodeStream: () => ipcRenderer.invoke("opencode:stream:stop"),
  acknowledgeOpenCodeStream: (generation, sequence) =>
    ipcRenderer.invoke("opencode:stream:acknowledge", generation, sequence),
  openCodeStreamReconciliationReady: (generation) =>
    ipcRenderer.invoke("opencode:stream:reconciliation-ready", generation),
  list: () => ipcRenderer.invoke("vault:list"),
  chooseLocal: () => ipcRenderer.invoke("vault:choose-local"),
  clone: (url) => ipcRenderer.invoke("vault:clone", url),
  createEmpty: (name, format) => ipcRenderer.invoke("vault:create-empty", name, format),
  updateVault: (vaultId, update) => ipcRenderer.invoke("vault:update", vaultId, update),
  removeVault: (vaultId) => ipcRenderer.invoke("vault:remove", vaultId),
  manifest: (vaultId) => ipcRenderer.invoke("vault:manifest", vaultId),
  document: (vaultId, documentId) => ipcRenderer.invoke("vault:document", vaultId, documentId),
  documentPath: (vaultId, documentId) => ipcRenderer.invoke("vault:document-path", vaultId, documentId),
  saveDocumentPdf: (vaultId, documentId) => ipcRenderer.invoke("vault:save-document-pdf", vaultId, documentId),
  watch: (vaultId) => ipcRenderer.invoke("vault:watch", vaultId),
  dashboards: (vaultId) => ipcRenderer.invoke("dashboard:list", vaultId),
  createDashboard: (vaultId, input) => ipcRenderer.invoke("dashboard:create", vaultId, input),
  renameDashboard: (vaultId, dashboardId, title) => ipcRenderer.invoke("dashboard:rename", vaultId, dashboardId, title),
  reorderDashboards: (vaultId, dashboardIds) => ipcRenderer.invoke("dashboard:reorder", vaultId, dashboardIds),
  removeDashboard: (vaultId, dashboardId) => ipcRenderer.invoke("dashboard:remove", vaultId, dashboardId),
  moveDashboard: (vaultId, dashboardId, location) =>
    ipcRenderer.invoke("dashboard:move", vaultId, dashboardId, location),
  dashboardAgentHandoff: (vaultId, dashboardId) => ipcRenderer.invoke("dashboard:agent-handoff", vaultId, dashboardId),
  openDashboard: (vaultId, dashboardId) => ipcRenderer.invoke("dashboard-runtime:open", vaultId, dashboardId),
  stopDashboard: () => ipcRenderer.invoke("dashboard-runtime:stop"),
  dashboardRuntimeStatus: () => ipcRenderer.invoke("dashboard-runtime:status"),
  prepareDashboardTrustedFlow: () => ipcRenderer.invoke("dashboard-runtime:prepare-trusted-flow"),
  dashboardRuntimeAuthorityCountForTesting: () => ipcRenderer.invoke("dashboard-runtime:authority-count-for-testing"),
  dashboardPermissionDetails: (vaultId, dashboardId) =>
    ipcRenderer.invoke("dashboard-permissions:details", vaultId, dashboardId),
  grantDashboardPermissions: (vaultId, dashboardId, capabilities, documentScope, selectedDocumentIds) =>
    ipcRenderer.invoke(
      "dashboard-permissions:grant",
      vaultId,
      dashboardId,
      capabilities,
      documentScope,
      selectedDocumentIds,
    ),
  revokeDashboardPermissions: (vaultId, dashboardId) =>
    ipcRenderer.invoke("dashboard-permissions:revoke", vaultId, dashboardId),
  dashboardSecrets: () => ipcRenderer.invoke("dashboard-secrets:overview"),
  setDashboardSecret: (name, value) => ipcRenderer.invoke("dashboard-secrets:set", name, value),
  deleteDashboardSecret: (name) => ipcRenderer.invoke("dashboard-secrets:delete", name),
  blame: (vaultId, documentId) => ipcRenderer.invoke("vault:blame", vaultId, documentId),
  quickNotes: (vaultId) => ipcRenderer.invoke("vault:quick-notes", vaultId),
  saveQuickNotes: (vaultId, html) => ipcRenderer.invoke("vault:save-quick-notes", vaultId, html),
  graph: (vaultId) => ipcRenderer.invoke("vault:graph", vaultId),
  changes: (vaultId) => ipcRenderer.invoke("vault:changes", vaultId),
  sync: (vaultId) => ipcRenderer.invoke("vault:sync", vaultId),
  updateStatus: () => ipcRenderer.invoke("app:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  changelog: () => ipcRenderer.invoke("app:changelog"),
  securityAssessmentPrompt: (version) => ipcRenderer.invoke("app:security-assessment-prompt", version),
  setTitleBarTheme: (theme) => ipcRenderer.invoke("app:set-title-bar-theme", theme),
  pendingOpenDocument: () => ipcRenderer.invoke("app:pending-open-document"),
  onUpdateStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status);
    ipcRenderer.on("app:update-status", handler);
    return () => ipcRenderer.removeListener("app:update-status", handler);
  },
  onVaultChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, vaultId: string) => listener(vaultId);
    ipcRenderer.on("vault:changed", handler);
    return () => ipcRenderer.removeListener("vault:changed", handler);
  },
  onOpenDocument: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, request: Parameters<typeof listener>[0]) => listener(request);
    ipcRenderer.on("app:open-document", handler);
    return () => ipcRenderer.removeListener("app:open-document", handler);
  },
  onOpenCodeStream: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, delivery: unknown) => {
      if (isOpenCodeStreamDelivery(delivery)) listener(delivery);
    };
    ipcRenderer.on("opencode:stream:delivery", handler);
    return () => ipcRenderer.removeListener("opencode:stream:delivery", handler);
  },
  skillStatus: () => ipcRenderer.invoke("skill:status"),
  skillProviderSelection: () => ipcRenderer.invoke("skill:provider-selection"),
  saveSkillProviderSelection: (providers) => ipcRenderer.invoke("skill:save-provider-selection", providers),
  installSkills: () => ipcRenderer.invoke("skill:install"),
  exportClaudePlugin: () => ipcRenderer.invoke("skill:export-claude-plugin"),
  claudePluginStatus: () => ipcRenderer.invoke("skill:claude-plugin-status"),
  githubStatus: () => ipcRenderer.invoke("github:status"),
  startDeviceFlow: () => ipcRenderer.invoke("github:start-device-flow"),
  cancelDeviceFlow: () => ipcRenderer.invoke("github:cancel-device-flow"),
  disconnectGithub: (login) => ipcRenderer.invoke("github:disconnect", login),
  listGithubRepos: () => ipcRenderer.invoke("github:list-repos"),
  cloneGithubRepo: (fullName, account) => ipcRenderer.invoke("github:clone-by-full-name", fullName, account),
  createGithubRepoAndClone: (input) => ipcRenderer.invoke("github:create-repo-and-clone", input),
  onGithubStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status);
    ipcRenderer.on("github:status", handler);
    return () => ipcRenderer.removeListener("github:status", handler);
  },
  onGithubDeviceFlow: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]) => listener(event);
    ipcRenderer.on("github:device-flow", handler);
    return () => ipcRenderer.removeListener("github:device-flow", handler);
  },
};

contextBridge.exposeInMainWorld("vaultApi", api);
