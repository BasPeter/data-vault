import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { VaultService } from "./vault";
import { checkForUpdates, configureUpdater, installUpdate, updateStatus } from "./updater";

let service: VaultService;

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

function htmlArgument(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2 * 1024 * 1024) {
    throw new Error("Invalid quick notes HTML.");
  }
  return value;
}

function registerIpc(): void {
  ipcMain.handle("vault:list", (event) => { assertTrusted(event); return service.list(); });
  ipcMain.handle("vault:choose-local", async (event) => {
    assertTrusted(event);
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : service.addLocal(result.filePaths[0]);
  });
  ipcMain.handle("vault:clone", (event, url) => {
    assertTrusted(event);
    return service.clone(stringArgument(url, "repository URL"));
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
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    show: false,
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
  configureUpdater();
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
