import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { VaultService } from "./vault";
import { SkillService } from "./skills";
import { GitHubService } from "./github";
import {
  changelog,
  checkForUpdates,
  configureUpdater,
  installUpdate,
  securityAssessmentPrompt,
  updateStatus,
} from "./updater";
import type { VaultStructure, VaultUpdate } from "../src/types";

// Bounds for the optional vault.json `structure` tree, mirrored from
// electron/vault.ts. The renderer is trusted but validated defensively.
const STRUCTURE_MAX_NODES = 500;
const STRUCTURE_MAX_DEPTH = 16;
const STRUCTURE_MAX_TEXT = 1000;

const APPLICATION_NAME = "Data Vault";
app.setName(APPLICATION_NAME);

let service: VaultService;
let skills: SkillService;
let github: GitHubService;
let vaultChangePoll: NodeJS.Timeout | null = null;
const watchedVaults = new Map<string, string>();

function applicationIconPath(): string {
  const iconName = process.platform === "win32" ? "icon.win.png" : "icon.png";
  return app.isPackaged ? path.join(process.resourcesPath, iconName) : path.resolve("build", iconName);
}

function assertTrusted(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  if (!url) throw new Error("Missing IPC sender.");
  const trusted = url.startsWith("file://") || url.startsWith("http://localhost:");
  if (!trusted) throw new Error("Untrusted IPC sender.");
}

function stringArgument(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function optionalText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > STRUCTURE_MAX_TEXT) throw new Error(`Invalid ${name}.`);
  return value;
}

// `owner/repo`, each segment limited to GitHub's allowed characters. Rejecting
// stray characters also keeps the https://github.com/<fullName>.git URL we build
// well-formed.
function repoFullNameArgument(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.length > 256) {
    throw new Error("Invalid repository name.");
  }
  return value;
}

// A GitHub login: letters, digits, and hyphens, up to 39 characters.
function loginArgument(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z\d-]{1,39}$/.test(value)) {
    throw new Error("Invalid GitHub account.");
  }
  return value;
}

function createRepoArgument(value: unknown): { name: string; private: boolean; account: string } {
  if (typeof value !== "object" || value === null) throw new Error("Invalid repository details.");
  const record = value as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== "string" || !/^[A-Za-z0-9_.-]+$/.test(name) || name.length > 100) {
    throw new Error("Repository names may use letters, numbers, hyphens, underscores, and dots.");
  }
  if (typeof record.private !== "boolean") throw new Error("Invalid repository visibility.");
  return { name, private: record.private, account: loginArgument(record.account) };
}

function structureArgument(value: unknown): VaultStructure {
  let remaining = STRUCTURE_MAX_NODES;
  function level(input: unknown, depth: number): VaultStructure {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("Invalid vault structure.");
    if (depth > STRUCTURE_MAX_DEPTH) throw new Error("Vault structure is too deep.");
    const output: VaultStructure = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      if (!key || key === "." || key === ".." || /[/\\]/.test(key)) throw new Error("Invalid directory name.");
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid vault structure.");
      if (--remaining < 0) throw new Error("Vault structure is too large.");
      const node = raw as Record<string, unknown>;
      const entry: VaultStructure[string] = {};
      if (node.title !== undefined) entry.title = optionalText(node.title, "directory title");
      if (node.description !== undefined) entry.description = optionalText(node.description, "directory description");
      if (node.children !== undefined) entry.children = level(node.children, depth + 1);
      output[key] = entry;
    }
    return output;
  }
  return level(value, 1);
}

function updateArgument(value: unknown): VaultUpdate {
  if (typeof value !== "object" || value === null) throw new Error("Invalid vault update.");
  const update = value as Record<string, unknown>;
  const result: VaultUpdate = {};
  if (update.name !== undefined) result.name = stringArgument(update.name, "vault name");
  if (update.remoteUrl !== undefined) result.remoteUrl = stringArgument(update.remoteUrl, "remote URL");
  if (update.defaultLanguage !== undefined)
    result.defaultLanguage = optionalText(update.defaultLanguage, "default language");
  if (update.structure !== undefined) result.structure = structureArgument(update.structure);
  if (
    result.name === undefined &&
    result.remoteUrl === undefined &&
    result.defaultLanguage === undefined &&
    result.structure === undefined
  ) {
    throw new Error("Nothing to update.");
  }
  return result;
}

function htmlArgument(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Invalid quick notes HTML.");
  }
  return value;
}

function pdfFileName(title: string, fallback: string): string {
  const base = (title || fallback)
    .replace(/\.html$/i, "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replaceAll(/./g, (character) => (character.charCodeAt(0) < 32 ? " " : character))
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "document"}.pdf`;
}

function optionalVersionArgument(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error("Invalid version.");
  }
  return value;
}

function titleBarThemeArgument(value: unknown): "light" | "dark" {
  if (value !== "light" && value !== "dark") throw new Error("Invalid title bar theme.");
  return value;
}

// Re-install the generated agent skills whenever they are missing or outdated.
// Best-effort: a read-only home directory or similar must never break the app,
// so failures are logged and surfaced through the existing stale indicator.
function autoInstallSkills(): void {
  try {
    const vaults = service.list();
    if (skills.status(vaults).state !== "current") skills.install(vaults);
  } catch (error) {
    console.error("Automatic skill install failed:", error);
  }
}

function broadcastVaultChanged(vaultId: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("vault:changed", vaultId);
  }
}

function pollWatchedVaults(): void {
  for (const [vaultId, previous] of watchedVaults) {
    try {
      const next = service.contentSignature(vaultId);
      if (next !== previous) {
        watchedVaults.set(vaultId, next);
        broadcastVaultChanged(vaultId);
      }
    } catch {
      watchedVaults.delete(vaultId);
      broadcastVaultChanged(vaultId);
    }
  }
  if (watchedVaults.size === 0 && vaultChangePoll) {
    clearInterval(vaultChangePoll);
    vaultChangePoll = null;
  }
}

function watchVault(vaultId: string): void {
  watchedVaults.set(vaultId, service.contentSignature(vaultId));
  if (!vaultChangePoll) vaultChangePoll = setInterval(pollWatchedVaults, 1500);
}

function registerIpc(): void {
  ipcMain.handle("vault:list", (event) => {
    assertTrusted(event);
    return service.list();
  });
  ipcMain.handle("vault:choose-local", async (event) => {
    assertTrusted(event);
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled) return null;
    const vault = service.addLocal(result.filePaths[0]);
    autoInstallSkills();
    return vault;
  });
  ipcMain.handle("vault:clone", async (event, url) => {
    assertTrusted(event);
    const vault = await service.clone(stringArgument(url, "repository URL"));
    autoInstallSkills();
    return vault;
  });
  ipcMain.handle("vault:create-empty", async (event, name) => {
    assertTrusted(event);
    const vault = await service.createEmpty(stringArgument(name, "vault name"));
    autoInstallSkills();
    return vault;
  });
  ipcMain.handle("vault:update", async (event, vaultId, update) => {
    assertTrusted(event);
    const result = await service.updateVault(stringArgument(vaultId, "vault ID"), updateArgument(update));
    autoInstallSkills();
    return result;
  });
  ipcMain.handle("vault:manifest", (event, vaultId) => {
    assertTrusted(event);
    return service.manifest(stringArgument(vaultId, "vault ID"));
  });
  ipcMain.handle("vault:document", (event, vaultId, documentId) => {
    assertTrusted(event);
    return service.document(stringArgument(vaultId, "vault ID"), stringArgument(documentId, "document ID"));
  });
  ipcMain.handle("vault:save-document-pdf", async (event, vaultId, documentId) => {
    assertTrusted(event);
    const id = stringArgument(documentId, "document ID");
    const doc = service.document(stringArgument(vaultId, "vault ID"), id);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("No application window available.");

    const result = await dialog.showSaveDialog(window, {
      title: "Save document as PDF",
      defaultPath: pdfFileName(doc.title, path.basename(id)),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    const pdf = await window.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { marginType: "default" },
    });
    fs.writeFileSync(result.filePath, pdf);
    return { saved: true, filePath: result.filePath };
  });
  ipcMain.handle("vault:watch", (event, vaultId) => {
    assertTrusted(event);
    watchVault(stringArgument(vaultId, "vault ID"));
  });
  ipcMain.handle("vault:blame", (event, vaultId, documentId) => {
    assertTrusted(event);
    return service.blame(stringArgument(vaultId, "vault ID"), stringArgument(documentId, "document ID"));
  });
  ipcMain.handle("vault:quick-notes", (event, vaultId) => {
    assertTrusted(event);
    return service.quickNotes(stringArgument(vaultId, "vault ID"));
  });
  ipcMain.handle("vault:save-quick-notes", (event, vaultId, html) => {
    assertTrusted(event);
    service.saveQuickNotes(stringArgument(vaultId, "vault ID"), htmlArgument(html));
  });
  ipcMain.handle("vault:graph", (event, vaultId) => {
    assertTrusted(event);
    return service.graph(stringArgument(vaultId, "vault ID"));
  });
  ipcMain.handle("vault:sync", (event, vaultId) => {
    assertTrusted(event);
    return service.sync(stringArgument(vaultId, "vault ID"));
  });
  ipcMain.handle("app:update-status", (event) => {
    assertTrusted(event);
    return updateStatus();
  });
  ipcMain.handle("app:check-for-updates", (event) => {
    assertTrusted(event);
    return checkForUpdates();
  });
  ipcMain.handle("app:install-update", (event) => {
    assertTrusted(event);
    installUpdate();
  });
  ipcMain.handle("app:changelog", (event) => {
    assertTrusted(event);
    return changelog();
  });
  ipcMain.handle("app:security-assessment-prompt", (event, version) => {
    assertTrusted(event);
    return securityAssessmentPrompt(optionalVersionArgument(version));
  });
  ipcMain.handle("app:set-title-bar-theme", (event, value) => {
    assertTrusted(event);
    const theme = titleBarThemeArgument(value);
    if (process.platform !== "win32") return;
    BrowserWindow.fromWebContents(event.sender)?.setTitleBarOverlay({
      color: "#00000000",
      symbolColor: theme === "dark" ? "#fafafa" : "#18181b",
      height: 56,
    });
  });
  ipcMain.handle("skill:status", (event) => {
    assertTrusted(event);
    return skills.status(service.list());
  });
  ipcMain.handle("skill:install", (event) => {
    assertTrusted(event);
    return skills.install(service.list());
  });
  ipcMain.handle("github:status", (event) => {
    assertTrusted(event);
    return github.getStatus();
  });
  ipcMain.handle("github:start-device-flow", (event) => {
    assertTrusted(event);
    return github.startDeviceFlow();
  });
  ipcMain.handle("github:cancel-device-flow", (event) => {
    assertTrusted(event);
    github.cancelDeviceFlow();
  });
  ipcMain.handle("github:disconnect", (event, login) => {
    assertTrusted(event);
    return github.disconnect(loginArgument(login));
  });
  ipcMain.handle("github:list-repos", (event) => {
    assertTrusted(event);
    return github.listRepos();
  });
  ipcMain.handle("github:clone-by-full-name", async (event, fullName, account) => {
    assertTrusted(event);
    const vault = await service.cloneByFullName(repoFullNameArgument(fullName), loginArgument(account));
    autoInstallSkills();
    return vault;
  });
  ipcMain.handle("github:create-repo-and-clone", async (event, input) => {
    assertTrusted(event);
    const { name, private: isPrivate, account } = createRepoArgument(input);
    const repo = await github.createRepo({ name, private: isPrivate, account });
    const vault = await service.cloneByFullName(repo.fullName, account);
    autoInstallSkills();
    return vault;
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    show: false,
    icon: applicationIconPath(),
    // Integrate native window controls into the app header: inset traffic lights
    // on macOS and a Window Controls Overlay on Windows.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 19 } }
      : process.platform === "win32"
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: { color: "#00000000", symbolColor: "#18181b", height: 56 },
          }
        : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  github = new GitHubService(app.getPath("userData"));
  service = new VaultService(app.getPath("userData"), (account, owner) => github.authHeaderValue(account, owner));
  // E2E runs launch against a throwaway `--user-data-dir`, but skills install to
  // the home directory, which the Chromium switch does not isolate. Redirect the
  // skills home into that same throwaway dir under test so automated runs never
  // overwrite the developer's real ~/.claude and ~/.codex skills. Production
  // keeps the default (the real home directory).
  skills = new SkillService(process.env.NODE_ENV === "test" ? app.getPath("userData") : undefined);
  autoInstallSkills();
  configureUpdater();
  registerIpc();
  app.setAboutPanelOptions({
    applicationName: APPLICATION_NAME,
    applicationVersion: app.getVersion(),
    iconPath: applicationIconPath(),
  });
  if (process.platform === "darwin") {
    app.dock?.setIcon(applicationIconPath());
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
