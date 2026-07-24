import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  BrowserWindow,
  session,
  type IpcMainInvokeEvent,
  type Session,
  type WebContents,
  type WebPreferences,
} from "electron";
import type { DashboardManifest, DashboardSecretDeclaration } from "../src/dashboard-contracts";
import {
  DASHBOARD_SCHEMA_VERSION,
  type DashboardCapabilityId,
  type DashboardDocumentScope,
  type DashboardEffectivePermissions,
  type DashboardInfo,
  type DashboardOpenExternalLinkResponse,
  type DashboardRuntimeDescriptor,
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
  type DashboardApiOperation,
} from "./dashboard-runtime-policy";
import { DashboardExternalLinkPromptGate } from "./dashboard-external-link-flow";

export const DASHBOARD_EXPENSIVE_READ_MAX_PER_MINUTE = 30;

export type DashboardRuntimeSource = Readonly<{
  vaultId: string;
  repositoryPath: string;
  manifest: DashboardManifest;
  bundleDirectory: string;
}>;

export type { DashboardRuntimeDescriptor } from "../src/dashboard-contracts";

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
  confirmExternalLink: (url: string) => Promise<boolean>;
  openExternalLink: (url: string) => Promise<void>;
}>;

export type DashboardRuntimeStatus = "loading" | "ready" | "failed" | "unresponsive" | "stopped";

type Runtime = {
  generation: symbol;
  runtimeId: string;
  partition: string;
  src: string;
  manifest: DashboardManifest;
  source: DashboardRuntimeSource;
  snapshot: DashboardAssetSnapshot;
  session: Session;
  // Null until the trusted renderer mounts the `<webview>` and the guest
  // attaches; the guest webContents is owned by the renderer element, not
  // constructed here.
  contents: WebContents | null;
  senderId: number | null;
  active: boolean;
  loaded: boolean;
  attached: boolean;
  status: DashboardRuntimeStatus;
  expensiveReadInFlight: boolean;
  expensiveReadTimestamps: number[];
  externalLinkPromptGate: DashboardExternalLinkPromptGate;
  cleanups: Array<() => void>;
};

export class DashboardRuntimeController {
  private runtime: Runtime | null = null;
  private lastFailure: { runtimeId: string; status: "failed"; attached: false } | null = null;
  private readonly authority = new Map<number, symbol>();
  private readonly willAttachListener: (
    event: Electron.Event,
    webPreferences: WebPreferences,
    params: Record<string, string>,
  ) => void;
  private readonly didAttachListener: (event: Electron.Event, webContents: WebContents) => void;

  constructor(
    private readonly window: BrowserWindow,
    private readonly preloadPath: string,
    private readonly resolveSource: (vaultId: string, dashboardId: string) => DashboardRuntimeSource,
    private readonly services: DashboardRuntimeServices,
  ) {
    // The dashboard runs as an in-renderer `<webview>`, so guest creation is
    // driven by the trusted renderer's DOM. Main keeps authority by hardening the
    // guest at `will-attach-webview` and binding it at `did-attach-webview`; a
    // guest whose preferences, partition, or src were not established here is
    // denied before it attaches.
    this.willAttachListener = (event, webPreferences, params) => {
      if (!this.authorizeAttach(webPreferences, params)) event.preventDefault();
    };
    this.didAttachListener = (_event, contents) => this.bindGuest(contents);
    this.window.webContents.on("will-attach-webview", this.willAttachListener);
    this.window.webContents.on("did-attach-webview", this.didAttachListener);
  }

  /**
   * Prepares an isolated runtime for the requested dashboard and returns the
   * descriptor the renderer needs to mount its `<webview>`. No guest webContents
   * exists yet: the renderer mounts the element, and the guest attaches through
   * the hardened attach hooks. Any previously running dashboard is torn down
   * first, invalidating its authority before this returns.
   */
  prepare(vaultId: string, dashboardId: string): DashboardRuntimeDescriptor {
    this.teardown();
    this.lastFailure = null;
    const source = this.resolveSource(vaultId, dashboardId);
    const snapshot = createDashboardAssetSnapshot(source.bundleDirectory);
    const runtimeId = randomUUID();
    const partition = `dashboard-${runtimeId}`;
    const src = `${DASHBOARD_SCHEME}://${runtimeId}/${source.manifest.entrypoint}`;
    const isolatedSession = session.fromPartition(partition, { cache: false });
    const runtime: Runtime = {
      generation: Symbol(runtimeId),
      runtimeId,
      partition,
      src,
      manifest: source.manifest,
      source,
      snapshot,
      session: isolatedSession,
      contents: null,
      senderId: null,
      active: true,
      loaded: false,
      attached: false,
      status: "loading",
      expensiveReadInFlight: false,
      expensiveReadTimestamps: [],
      externalLinkPromptGate: new DashboardExternalLinkPromptGate(),
      cleanups: [],
    };
    this.runtime = runtime;
    this.installSessionPolicy(runtime);
    return { runtimeId, partition, src };
  }

  /**
   * Called from the host `will-attach-webview` hook. Returns whether the guest is
   * the prepared runtime's; when it is, it forces the guest's webPreferences to
   * the sandboxed dashboard profile. A mismatched partition/src, an
   * already-attached runtime, or no active runtime is denied.
   */
  authorizeAttach(webPreferences: WebPreferences, params: Record<string, unknown>): boolean {
    const runtime = this.runtime;
    if (!runtime?.active || runtime.contents) return false;
    if (params.partition !== runtime.partition || params.src !== runtime.src) return false;
    webPreferences.preload = this.preloadPath;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.spellcheck = false;
    webPreferences.webviewTag = false;
    return true;
  }

  /**
   * Called from the host `did-attach-webview` hook. Binds the guest webContents
   * to the prepared runtime, grants it IPC authority, and installs the
   * navigation/lifecycle policy. A guest that does not match the pending runtime
   * — a race, a stale attach, or an unexpected embed — is closed immediately.
   */
  bindGuest(contents: WebContents): void {
    const runtime = this.runtime;
    if (!runtime?.active || runtime.contents) {
      try {
        if (!contents.isDestroyed()) contents.close();
      } catch {
        // Best-effort: an unexpected guest is destroyed, not adopted.
      }
      return;
    }
    runtime.contents = contents;
    runtime.senderId = contents.id;
    runtime.attached = true;
    this.authority.set(contents.id, runtime.generation);
    this.installWebContentsPolicy(runtime);
    if (contents.isLoadingMainFrame && !contents.isLoadingMainFrame()) {
      // The guest can finish loading before this hook runs; treat an already
      // settled main frame as ready so status does not stick on "loading".
      runtime.loaded = true;
      runtime.status = "ready";
    }
  }

  stop(): void {
    this.teardown();
  }

  currentRuntimeId(): string | null {
    return this.runtime?.active ? this.runtime.runtimeId : null;
  }

  destroyFocusedCurrentGuest(contents: WebContents): string {
    const runtime = this.runtime;
    if (!runtime?.active) throw new Error("Dashboard trusted flow is unavailable.");
    if (runtime.contents !== contents) throw new Error("Dashboard trusted flow is unavailable.");
    if (runtime.senderId !== contents.id) throw new Error("Dashboard trusted flow is unavailable.");
    if (contents.isDestroyed()) throw new Error("Dashboard trusted flow is unavailable.");
    if (contents.getType() !== "webview") throw new Error("Dashboard trusted flow is unavailable.");
    if (contents.hostWebContents?.id !== this.window.webContents.id) {
      throw new Error("Dashboard trusted flow is unavailable.");
    }
    if (this.authority.get(contents.id) !== runtime.generation) {
      throw new Error("Dashboard trusted flow is unavailable.");
    }
    const runtimeId = runtime.runtimeId;
    this.teardown();
    return runtimeId;
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
        this.window.webContents.off("will-attach-webview", this.willAttachListener);
        this.window.webContents.off("did-attach-webview", this.didAttachListener);
      }
    } catch {
      // BrowserWindow teardown can race listener cleanup.
    }
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
    if (operation === "open-external-link") {
      return this.openExternalLink(runtime, event, (value as { url: string }).url);
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
        digest: string;
      }>
    | { runtimeId: string; webContentsId: -1; status: "failed"; attached: false; digest: "" }
    | null {
    const runtime = this.runtime;
    if (!runtime && this.lastFailure) {
      return { ...this.lastFailure, webContentsId: -1, digest: "" };
    }
    return runtime
      ? {
          runtimeId: runtime.runtimeId,
          webContentsId: runtime.senderId ?? -1,
          status: runtime.status,
          attached: runtime.attached && !!runtime.contents && !runtime.contents.isDestroyed(),
          digest: runtime.snapshot.digest,
        }
      : null;
  }

  getAuthorityCountForTesting(): number {
    return this.authority.size;
  }

  private authenticate(event: IpcMainInvokeEvent): Runtime {
    const runtime = this.runtime;
    if (!runtime?.active || !runtime.contents) throw new Error("Untrusted dashboard API sender.");
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

  private async openExternalLink(
    runtime: Runtime,
    event: IpcMainInvokeEvent,
    url: string,
  ): Promise<DashboardOpenExternalLinkResponse> {
    const opened = await runtime.externalLinkPromptGate.request(
      () => this.services.confirmExternalLink(url),
      // Re-authenticate the exact IPC identity after an asynchronous trusted prompt.
      () => {
        if (!this.isCurrentIdentity(runtime)) throw new Error("Dashboard runtime is unavailable.");
        this.authenticate(event);
      },
      () => this.services.openExternalLink(url),
    );
    return { opened };
  }

  private isCurrent(runtime: Runtime): boolean {
    return runtime.active && this.runtime === runtime && !!runtime.contents && !runtime.contents.isDestroyed();
  }

  private isCurrentIdentity(runtime: Runtime): boolean {
    return runtime.active && this.runtime === runtime;
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
    if (!contents) return;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    const prevent = (event: Electron.Event): void => event.preventDefault();
    const preventNavigation = (event: Electron.Event): void => event.preventDefault();
    const preventFrameNavigation = (event: Electron.Event): void => event.preventDefault();
    const finished = (): void => {
      if (!this.isCurrent(runtime)) return;
      runtime.loaded = true;
      if (runtime.status === "loading") runtime.status = "ready";
    };
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
    };
    const responsive = (): void => {
      if (!this.isCurrent(runtime) || runtime.status !== "unresponsive") return;
      runtime.status = "ready";
    };
    const destroyed = (): void => {
      // `destroyed` is emitted only after `contents.isDestroyed()` becomes true,
      // so identity/generation ownership—not native liveness—must gate cleanup.
      if (this.isCurrentIdentity(runtime)) this.teardown();
    };
    contents.on("will-navigate", preventNavigation);
    contents.on("will-frame-navigate", preventFrameNavigation);
    contents.on("will-attach-webview", prevent);
    contents.on("did-finish-load", finished);
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
      contents.off("did-finish-load", finished);
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
    if (runtime.senderId !== null) this.authority.delete(runtime.senderId);
    runtime.expensiveReadInFlight = false;
    runtime.expensiveReadTimestamps = [];
    runtime.externalLinkPromptGate.cancel();
    this.services.releaseState(runtime.runtimeId);
    if (this.runtime === runtime) this.runtime = null;
    for (const cleanup of runtime.cleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch {
        // Teardown is deliberately idempotent and best-effort after authority removal.
      }
    }
    const contents = runtime.contents;
    if (contents) {
      try {
        if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false });
      } catch {
        // Native destruction can win after isDestroyed() and before close().
      }
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
