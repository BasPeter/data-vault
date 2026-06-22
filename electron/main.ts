import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { VaultService } from "./vault";
import { SkillService } from "./skills";
import { checkForUpdates, configureUpdater, installUpdate, updateStatus } from "./updater";
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

function applicationIconPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.resolve("build/icon.png");
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

function structureArgument(value: unknown): VaultStructure {
  let remaining = STRUCTURE_MAX_NODES;
  function level(input: unknown, depth: number): VaultStructure {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Invalid vault structure.");
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
  if (update.defaultLanguage !== undefined) result.defaultLanguage = optionalText(update.defaultLanguage, "default language");
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

function registerIpc(): void {
  ipcMain.handle("vault:list", (event) => { assertTrusted(event); return service.list(); });
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
  ipcMain.handle("app:update-status", (event) => { assertTrusted(event); return updateStatus(); });
  ipcMain.handle("app:check-for-updates", (event) => { assertTrusted(event); return checkForUpdates(); });
  ipcMain.handle("app:install-update", (event) => { assertTrusted(event); installUpdate(); });
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
  ipcMain.handle("skill:status", (event) => { assertTrusted(event); return skills.status(service.list()); });
  ipcMain.handle("skill:install", (event) => { assertTrusted(event); return skills.install(service.list()); });
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
  service = new VaultService(app.getPath("userData"));
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
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
