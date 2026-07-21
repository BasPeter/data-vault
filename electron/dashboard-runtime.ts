import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  BrowserWindow,
  WebContentsView,
  nativeTheme,
  session,
  type IpcMainInvokeEvent,
  type Rectangle,
  type Session,
  type WebContents,
} from "electron";
import type { DashboardManifest, DashboardSecretDeclaration } from "../src/dashboard-contracts";
import {
  DASHBOARD_SCHEMA_VERSION,
  type DashboardCapabilityId,
  type DashboardDocumentScope,
  type DashboardEffectivePermissions,
  type DashboardInfo,
  type DashboardState,
} from "../src/dashboard-contracts";
import {
  DASHBOARD_SCHEME,
  createDashboardAssetSnapshot,
  dashboardAssetHeaders,
  parseDashboardAssetUrl,
  type DashboardAssetSnapshot,
} from "./dashboard-runtime-assets";
import {
  isAuthenticatedDashboardSender,
  isExactDashboardOriginRequest,
  dashboardMainFrameIfAlive,
  validateDashboardApiArgument,
  validateDashboardBounds,
  type DashboardApiOperation,
} from "./dashboard-runtime-policy";

const TRUSTED_HEADER_HEIGHT = 56;
const SAFE_UNREGISTERED_SIDEBAR_WIDTH = 512;
export const DASHBOARD_EXPENSIVE_READ_MAX_PER_MINUTE = 30;
const DASHBOARD_SNAPSHOT_QUALITY = 80;

export type DashboardRuntimeSource = Readonly<{
  vaultId: string;
  repositoryPath: string;
  manifest: DashboardManifest;
  bundleDirectory: string;
}>;

export type DashboardRuntimeServices = Readonly<{
  permissions: (source: DashboardRuntimeSource, digest: string) => DashboardEffectivePermissions;
  grant: (
    source: DashboardRuntimeSource,
    digest: string,
    capabilities: readonly DashboardCapabilityId[],
    documentScope: DashboardDocumentScope,
    selectedDocumentIds: readonly string[],
  ) => DashboardEffectivePermissions;
  revoke: (source: DashboardRuntimeSource, digest: string) => void;
  documentsForSelection: (vaultId: string) => Array<{ id: string; title: string }>;
  readState: (vaultId: string, dashboardId: string) => DashboardState;
  writeState: (vaultId: string, dashboardId: string, runtimeId: string, state: unknown) => void;
  releaseState: (runtimeId: string) => void;
  readVaultIndex: (vaultId: string, permissions: DashboardEffectivePermissions) => unknown;
  readDocuments: (
    vaultId: string,
    permissions: DashboardEffectivePermissions,
    documentIds: readonly string[],
  ) => unknown;
  listSecrets: (manifest: DashboardManifest) => unknown;
  secureFetch: (manifest: DashboardManifest, request: unknown) => Promise<unknown>;
}>;

export type DashboardRuntimeStatus = "loading" | "ready" | "failed" | "unresponsive" | "stopped";

type Runtime = {
  generation: symbol;
  runtimeId: string;
  manifest: DashboardManifest;
  source: DashboardRuntimeSource;
  snapshot: DashboardAssetSnapshot;
  session: Session;
  view: WebContentsView;
  contents: WebContents;
  senderId: number;
  active: boolean;
  loaded: boolean;
  attached: boolean;
  bounds: Rectangle | null;
  allowedBounds: Rectangle | null;
  status: DashboardRuntimeStatus;
  suspended: boolean;
  expensiveReadInFlight: boolean;
  expensiveReadTimestamps: number[];
  cleanups: Array<() => void>;
};

function removeChildView(window: BrowserWindow, runtime: Runtime): void {
  if (!runtime.attached) return;
  runtime.attached = false;
  if (window.isDestroyed()) return;
  try {
    window.contentView.removeChildView(runtime.view);
  } catch {
    // The native view may already have been removed by BrowserWindow teardown.
  }
}

export class DashboardRuntimeController {
  private runtime: Runtime | null = null;
  private lastFailure: { runtimeId: string; status: "failed"; attached: false } | null = null;
  private readonly authority = new Map<number, symbol>();
  private readonly hostZoomListener: () => void;
  private readonly nativeThemeListener: () => void;

  constructor(
    private readonly window: BrowserWindow,
    private readonly preloadPath: string,
    private readonly resolveSource: (vaultId: string, dashboardId: string) => DashboardRuntimeSource,
    private readonly services: DashboardRuntimeServices,
  ) {
    this.hostZoomListener = () => this.lockHostZoom();
    this.lockHostZoom();
    window.webContents.on("zoom-changed", this.hostZoomListener);
    this.nativeThemeListener = () => {
      const runtime = this.runtime;
      if (!runtime?.active || runtime.contents.isDestroyed()) return;
      this.applyViewBackground(runtime.view);
    };
    nativeTheme.on("updated", this.nativeThemeListener);
  }

  async open(vaultId: string, dashboardId: string): Promise<void> {
    this.teardown();
    this.lastFailure = null;
    const source = this.resolveSource(vaultId, dashboardId);
    const snapshot = createDashboardAssetSnapshot(source.bundleDirectory);
    const runtimeId = randomUUID();
    const isolatedSession = session.fromPartition(`dashboard-${runtimeId}`, { cache: false });
    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        session: isolatedSession,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
      },
    });
    this.applyViewBackground(view);
    const contents = view.webContents;
    const runtime: Runtime = {
      generation: Symbol(runtimeId),
      runtimeId,
      manifest: source.manifest,
      source,
      snapshot,
      session: isolatedSession,
      view,
      contents,
      senderId: contents.id,
      active: true,
      loaded: false,
      attached: false,
      bounds: null,
      allowedBounds: null,
      status: "loading",
      suspended: false,
      expensiveReadInFlight: false,
      expensiveReadTimestamps: [],
      cleanups: [],
    };
    this.runtime = runtime;
    this.authority.set(contents.id, runtime.generation);

    try {
      this.installSessionPolicy(runtime);
      this.installWebContentsPolicy(runtime);
      await contents.loadURL(`${DASHBOARD_SCHEME}://${runtimeId}/${source.manifest.entrypoint}`);
      if (!this.isCurrent(runtime)) return;
      runtime.loaded = true;
      runtime.status = "ready";
      this.attachIfSafe(runtime);
    } catch (error) {
      // A switch, stop, crash, or window close deliberately destroys the old
      // webContents while loadURL may still be pending. That stale rejection is
      // expected and must not leak "Object has been destroyed" into trusted UI.
      if (runtime.status === "failed") throw new Error("Dashboard failed to load.", { cause: error });
      if (!this.isCurrent(runtime)) return;
      runtime.status = "failed";
      this.teardown("failed");
      throw new Error("Dashboard failed to load.", { cause: error });
    }
  }

  setBounds(value: unknown): void {
    const runtime = this.runtime;
    if (!runtime?.active || this.window.isDestroyed() || runtime.contents.isDestroyed()) return;
    this.lockHostZoom();
    if (this.window.webContents.getZoomFactor() !== 1 || this.window.webContents.getZoomLevel() !== 0) {
      this.detach();
      return;
    }
    const [contentWidth, contentHeight] = this.window.getContentSize();
    const contentBounds = { x: 0, y: 0, width: contentWidth, height: contentHeight };
    const allowedBounds = runtime.allowedBounds ?? {
      x: Math.min(SAFE_UNREGISTERED_SIDEBAR_WIDTH, contentWidth),
      y: Math.min(TRUSTED_HEADER_HEIGHT, contentHeight),
      width: Math.max(0, contentWidth - SAFE_UNREGISTERED_SIDEBAR_WIDTH),
      height: Math.max(0, contentHeight - TRUSTED_HEADER_HEIGHT),
    };
    const bounds = validateDashboardBounds(value, contentBounds, allowedBounds);
    if (!bounds) {
      runtime.bounds = null;
      this.detach();
      return;
    }
    runtime.bounds = bounds;
    try {
      runtime.view.setBounds(bounds);
    } catch {
      runtime.bounds = null;
      this.detach();
      return;
    }
    this.attachIfSafe(runtime);
  }

  setHostContentBounds(value: unknown): void {
    const runtime = this.runtime;
    if (!runtime?.active || this.window.isDestroyed()) return;
    const [contentWidth, contentHeight] = this.window.getContentSize();
    const contentBounds = { x: 0, y: 0, width: contentWidth, height: contentHeight };
    const belowHeader = {
      x: 0,
      y: Math.min(TRUSTED_HEADER_HEIGHT, contentHeight),
      width: contentWidth,
      height: Math.max(0, contentHeight - TRUSTED_HEADER_HEIGHT),
    };
    runtime.allowedBounds = validateDashboardBounds(value, contentBounds, belowHeader);
    if (!runtime.allowedBounds) {
      runtime.bounds = null;
      this.detach();
    }
  }

  detach(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    removeChildView(this.window, runtime);
    try {
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.focus();
    } catch {
      // The host may be destroyed between the checks and the native focus call.
    }
  }

  /**
   * A still of the dashboard, taken before it is detached so trusted UI can show
   * it in place of the native view. Without it the region paints nothing while an
   * overlay is open and the user sees a black hole where the dashboard was.
   *
   * The result is a bitmap of untrusted content, but it only ever replaces the
   * same rectangle that content already occupied, and carries no script.
   */
  async capture(): Promise<string | null> {
    const runtime = this.runtime;
    if (!runtime?.active || runtime.suspended || runtime.contents.isDestroyed()) return null;
    try {
      const image = await runtime.contents.capturePage();
      if (image.isEmpty()) return null;
      // JPEG rather than PNG: this crosses IPC on every overlay open, and the
      // still is dimmed behind a panel, so fidelity matters less than size.
      return `data:image/jpeg;base64,${image.toJPEG(DASHBOARD_SNAPSHOT_QUALITY).toString("base64")}`;
    } catch {
      // Capture races teardown, occlusion, and GPU loss; a missing still is fine.
      return null;
    }
  }

  suspend(): string | null {
    const runtime = this.runtime;
    if (!runtime?.active) return null;
    runtime.suspended = true;
    runtime.bounds = null;
    runtime.allowedBounds = null;
    this.detach();
    return runtime.runtimeId;
  }

  resume(runtimeId: unknown): void {
    if (typeof runtimeId !== "string" || runtimeId.length > 100) throw new Error("Invalid dashboard runtime token.");
    const runtime = this.runtime;
    if (!runtime?.active || runtime.runtimeId !== runtimeId) throw new Error("Dashboard runtime is unavailable.");
    runtime.suspended = false;
  }

  stop(): void {
    this.teardown();
  }

  stopForVault(vaultId: string): void {
    if (this.runtime?.source.vaultId === vaultId) this.teardown();
  }

  stopForDashboard(vaultId: string, dashboardId: string): void {
    if (this.runtime?.source.vaultId === vaultId && this.runtime.manifest.id === dashboardId) this.teardown();
  }

  dispose(): void {
    try {
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
        this.window.webContents.off("zoom-changed", this.hostZoomListener);
      }
    } catch {
      // BrowserWindow teardown can race listener cleanup.
    }
    nativeTheme.off("updated", this.nativeThemeListener);
    this.teardown();
  }

  handleApiCall(event: IpcMainInvokeEvent, operation: DashboardApiOperation, value?: unknown): unknown {
    const runtime = this.authenticate(event);
    validateDashboardApiArgument(operation, value);
    if (!runtime.active) throw new Error("Dashboard runtime is unavailable.");
    const permissions = this.services.permissions(runtime.source, runtime.snapshot.digest);
    if (operation === "get-info") {
      const response: DashboardInfo = {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: runtime.manifest.id,
        title: runtime.manifest.title,
        icon: runtime.manifest.icon,
        color: runtime.manifest.color,
        kind: runtime.manifest.kind,
        effectivePermissions: permissions,
      };
      return response;
    }
    if (operation === "read-state") {
      if (!permissions.capabilities.includes("state:read")) throw new Error("Dashboard access denied.");
      return this.services.readState(runtime.source.vaultId, runtime.manifest.id);
    }
    if (operation === "write-state") {
      if (!permissions.capabilities.includes("state:write")) throw new Error("Dashboard access denied.");
      this.services.writeState(
        runtime.source.vaultId,
        runtime.manifest.id,
        runtime.runtimeId,
        (value as Record<string, unknown>).state,
      );
      return { saved: true } as const;
    }
    if (operation === "read-vault-index") {
      return this.runExpensiveRead(runtime, () => this.services.readVaultIndex(runtime.source.vaultId, permissions));
    }
    if (operation === "list-secrets") {
      if (!permissions.capabilities.includes("secrets:use")) throw new Error("Dashboard access denied.");
      return this.services.listSecrets(runtime.manifest);
    }
    if (operation === "secure-fetch") {
      if (!permissions.capabilities.includes("secrets:use")) throw new Error("Dashboard access denied.");
      return this.runExpensiveRead(runtime, () =>
        this.services.secureFetch(runtime.manifest, (value as { request: unknown }).request),
      );
    }
    if (operation !== "read-documents") throw new Error("Invalid dashboard API request.");
    return this.runExpensiveRead(runtime, () =>
      this.services.readDocuments(
        runtime.source.vaultId,
        permissions,
        (value as { documentIds: string[] }).documentIds,
      ),
    );
  }

  permissionDetails(
    vaultId: unknown,
    dashboardId: unknown,
  ): Readonly<{
    requestedCapabilities: DashboardCapabilityId[];
    effectivePermissions: DashboardEffectivePermissions;
    documents: Array<{ id: string; title: string }>;
    secrets: Array<DashboardSecretDeclaration & { set: boolean }>;
  }> {
    const runtime = this.assertActiveHostTarget(vaultId, dashboardId);
    const listed = this.services.listSecrets(runtime.manifest) as { secrets?: Array<{ name: string; set: boolean }> };
    const status = new Map((listed.secrets ?? []).map((entry) => [entry.name, entry.set]));
    return {
      requestedCapabilities: [...runtime.manifest.requestedCapabilities],
      effectivePermissions: this.services.permissions(runtime.source, runtime.snapshot.digest),
      documents: this.services.documentsForSelection(runtime.source.vaultId),
      // Names, origins, and whether a value already exists — never the value.
      // `set` matters for consent: approving a dashboard that declares a name the
      // user already filled in for another dashboard hands it that existing value.
      secrets: (runtime.manifest.secrets ?? []).map((declaration) => ({
        name: declaration.name,
        origins: [...declaration.origins],
        set: status.get(declaration.name) ?? false,
      })),
    };
  }

  grantPermissions(
    vaultId: unknown,
    dashboardId: unknown,
    capabilities: readonly DashboardCapabilityId[],
    documentScope: DashboardDocumentScope,
    selectedDocumentIds: readonly string[],
  ): DashboardEffectivePermissions {
    const runtime = this.assertActiveHostTarget(vaultId, dashboardId);
    return this.services.grant(
      runtime.source,
      runtime.snapshot.digest,
      capabilities,
      documentScope,
      selectedDocumentIds,
    );
  }

  revokePermissions(vaultId: unknown, dashboardId: unknown): void {
    const runtime = this.assertActiveHostTarget(vaultId, dashboardId);
    this.services.revoke(runtime.source, runtime.snapshot.digest);
  }

  getStatusForTesting():
    | Readonly<{
        runtimeId: string;
        webContentsId: number;
        status: DashboardRuntimeStatus;
        attached: boolean;
        bounds: Rectangle | null;
        digest: string;
      }>
    | { runtimeId: string; webContentsId: -1; status: "failed"; attached: false; bounds: null; digest: "" }
    | null {
    const runtime = this.runtime;
    if (!runtime && this.lastFailure) {
      return { ...this.lastFailure, webContentsId: -1, bounds: null, digest: "" };
    }
    return runtime
      ? {
          runtimeId: runtime.runtimeId,
          webContentsId: runtime.senderId,
          status: runtime.status,
          attached: runtime.attached,
          bounds: runtime.bounds,
          digest: runtime.snapshot.digest,
        }
      : null;
  }

  getAuthorityCountForTesting(): number {
    return this.authority.size;
  }

  private authenticate(event: IpcMainInvokeEvent): Runtime {
    const runtime = this.runtime;
    if (!runtime?.active) throw new Error("Untrusted dashboard API sender.");
    const mainFrame = dashboardMainFrameIfAlive(runtime.contents);
    if (!mainFrame) {
      // Never let Electron's native destroyed-object error escape the bounded API contract.
      throw new Error("Untrusted dashboard API sender.");
    }
    if (
      !isAuthenticatedDashboardSender(
        {
          sender: runtime.contents,
          frame: mainFrame,
          generation: runtime.generation,
          grantedGeneration: this.authority.get(event.sender.id),
        },
        event.sender,
        event.senderFrame,
      )
    ) {
      throw new Error("Untrusted dashboard API sender.");
    }
    return runtime;
  }

  private assertActiveHostTarget(vaultId: unknown, dashboardId: unknown): Runtime {
    const runtime = this.runtime;
    if (
      !runtime?.active ||
      typeof vaultId !== "string" ||
      typeof dashboardId !== "string" ||
      runtime.source.vaultId !== vaultId ||
      runtime.manifest.id !== dashboardId
    ) {
      throw new Error("Dashboard runtime is unavailable.");
    }
    return runtime;
  }

  private async runExpensiveRead(runtime: Runtime, operation: () => unknown): Promise<unknown> {
    if (!this.isCurrentIdentity(runtime) || runtime.expensiveReadInFlight) {
      throw new Error("Dashboard read temporarily unavailable.");
    }
    const now = Date.now();
    runtime.expensiveReadTimestamps = runtime.expensiveReadTimestamps.filter((timestamp) => timestamp > now - 60_000);
    if (runtime.expensiveReadTimestamps.length >= DASHBOARD_EXPENSIVE_READ_MAX_PER_MINUTE) {
      throw new Error("Dashboard read rate limit exceeded.");
    }
    runtime.expensiveReadTimestamps.push(now);
    runtime.expensiveReadInFlight = true;
    try {
      return await operation();
    } finally {
      runtime.expensiveReadInFlight = false;
    }
  }

  private applyViewBackground(view: WebContentsView): void {
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff");
  }

  private lockHostZoom(): void {
    if (this.window.isDestroyed()) return;
    const host = this.window.webContents;
    if (host.isDestroyed()) return;
    host.setZoomFactor(1);
    host.setZoomLevel(0);
    void host.setVisualZoomLevelLimits(1, 1);
  }

  private isCurrent(runtime: Runtime): boolean {
    return runtime.active && this.runtime === runtime && !runtime.contents.isDestroyed();
  }

  private isCurrentIdentity(runtime: Runtime): boolean {
    return runtime.active && this.runtime === runtime;
  }

  private attachIfSafe(runtime: Runtime): void {
    if (
      this.window.isDestroyed() ||
      !this.isCurrent(runtime) ||
      runtime.status !== "ready" ||
      !runtime.loaded ||
      !runtime.bounds ||
      runtime.suspended ||
      runtime.attached
    )
      return;
    try {
      this.window.contentView.addChildView(runtime.view);
      runtime.attached = true;
      if (!runtime.contents.isDestroyed()) runtime.contents.focus();
    } catch {
      this.teardown();
    }
  }

  private installSessionPolicy(runtime: Runtime): void {
    const { session: isolatedSession, runtimeId, snapshot } = runtime;
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    isolatedSession.setDevicePermissionHandler(() => false);
    isolatedSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !runtime.active || !isExactDashboardOriginRequest(details.url, runtimeId) });
    });
    const denyDownload = (event: Electron.Event): void => event.preventDefault();
    isolatedSession.on("will-download", denyDownload);
    isolatedSession.protocol.handle(DASHBOARD_SCHEME, (request) => {
      if (!runtime.active) return new Response(null, { status: 410 });
      const assetPath = parseDashboardAssetUrl(request.url, runtimeId);
      const asset = assetPath ? snapshot.assets.get(assetPath) : undefined;
      if (!asset) return new Response(null, { status: 404 });
      return new Response(asset.bytes.slice(), { status: 200, headers: dashboardAssetHeaders(asset.mimeType) });
    });
    runtime.cleanups.push(() => {
      isolatedSession.setPermissionCheckHandler(null);
      isolatedSession.setPermissionRequestHandler(null);
      isolatedSession.setDevicePermissionHandler(null);
      isolatedSession.webRequest.onBeforeRequest(null);
      isolatedSession.off("will-download", denyDownload);
      isolatedSession.protocol.unhandle(DASHBOARD_SCHEME);
    });
  }

  private installWebContentsPolicy(runtime: Runtime): void {
    const contents = runtime.contents;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    const prevent = (event: Electron.Event): void => event.preventDefault();
    const preventNavigation = (event: Electron.Event): void => event.preventDefault();
    const preventFrameNavigation = (event: Electron.Event): void => event.preventDefault();
    const failed = (
      _event: Electron.Event,
      errorCode: number,
      _description: string,
      _url: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame || errorCode === -3 || !this.isCurrent(runtime)) return;
      runtime.status = "failed";
      this.teardown("failed");
    };
    const gone = (): void => {
      if (this.isCurrent(runtime)) this.teardown();
    };
    const unresponsive = (): void => {
      if (!this.isCurrent(runtime)) return;
      runtime.status = "unresponsive";
      this.detach();
    };
    const responsive = (): void => {
      if (!this.isCurrent(runtime) || runtime.status !== "unresponsive") return;
      runtime.status = "ready";
      this.attachIfSafe(runtime);
      if (this.isCurrentIdentity(runtime) && !runtime.attached) runtime.status = "unresponsive";
    };
    const destroyed = (): void => {
      // `destroyed` is emitted only after `contents.isDestroyed()` becomes true,
      // so identity/generation ownership—not native liveness—must gate cleanup.
      if (this.isCurrentIdentity(runtime)) this.teardown();
    };
    contents.on("will-navigate", preventNavigation);
    contents.on("will-frame-navigate", preventFrameNavigation);
    contents.on("will-attach-webview", prevent);
    contents.on("did-fail-load", failed);
    contents.on("render-process-gone", gone);
    contents.on("unresponsive", unresponsive);
    contents.on("responsive", responsive);
    contents.on("destroyed", destroyed);
    runtime.cleanups.push(() => {
      if (contents.isDestroyed()) return;
      contents.off("will-navigate", preventNavigation);
      contents.off("will-frame-navigate", preventFrameNavigation);
      contents.off("will-attach-webview", prevent);
      contents.off("did-fail-load", failed);
      contents.off("render-process-gone", gone);
      contents.off("unresponsive", unresponsive);
      contents.off("responsive", responsive);
      contents.off("destroyed", destroyed);
    });
  }

  private teardown(terminalStatus: "stopped" | "failed" = "stopped"): void {
    const runtime = this.runtime;
    if (!runtime) {
      if (terminalStatus === "stopped") this.lastFailure = null;
      return;
    }
    // Authority is always invalidated before any native view/session cleanup.
    runtime.active = false;
    runtime.status = terminalStatus;
    this.lastFailure =
      terminalStatus === "failed" ? { runtimeId: runtime.runtimeId, status: "failed", attached: false } : null;
    this.authority.delete(runtime.senderId);
    runtime.expensiveReadInFlight = false;
    runtime.expensiveReadTimestamps = [];
    this.services.releaseState(runtime.runtimeId);
    if (this.runtime === runtime) this.runtime = null;
    removeChildView(this.window, runtime);
    for (const cleanup of runtime.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch {
        // Teardown is deliberately idempotent and best-effort after authority removal.
      }
    }
    const contents = runtime.contents;
    try {
      if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false });
    } catch {
      // Native destruction can win after isDestroyed() and before close().
    }
    try {
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) this.window.webContents.focus();
    } catch {
      // BrowserWindow teardown can win after the liveness checks.
    }
  }
}

export function dashboardPreloadPath(mainDirectory: string): string {
  return path.join(mainDirectory, "../preload/dashboard.cjs");
}
