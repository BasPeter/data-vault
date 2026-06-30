import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  FileDown,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  Network,
  Plus,
  RefreshCw,
} from "lucide-react";
import { GithubConnectDialog } from "@/components/github-connect-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { DocumentPicker } from "@/components/document-picker";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentView } from "@/components/document-view";
import { GraphView } from "@/components/graph-view";
import { GuidedTour } from "@/components/guided-tour";
import { QuickNotesPanel } from "@/components/quick-notes-panel";
import { VaultSwitcher } from "@/components/vault-switcher";
import { VaultInitDialog } from "@/components/vault-init-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpdateButton } from "@/components/update-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { DocumentOpenRequest, Manifest, TreeNode, VaultFormat, VaultSummary } from "@/types";

function firstDocument(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "doc") return node.id;
    const found = firstDocument(node.children);
    if (found) return found;
  }
  return null;
}

function documentLabel(nodes: TreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.type === "doc" && node.id === id) return node.label;
    if (node.type === "folder") {
      const found = documentLabel(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function documentIds(nodes: TreeNode[], output = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type === "doc") output.add(node.id);
    else documentIds(node.children, output);
  }
  return output;
}

type DocumentTab = {
  id: string;
};

export default function App() {
  const { theme, toggle } = useTheme();
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest>({ tree: [] });
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const vaultIdRef = useRef<string | null>(null);
  const pendingOpenRequestRef = useRef<DocumentOpenRequest | null>(null);
  const tabsRef = useRef<DocumentTab[]>([]);
  const tabsInitializedRef = useRef(false);
  const [view, setView] = useState<"doc" | "graph">("doc");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [showBlame, setShowBlame] = useState(false);
  const [skippedSetupVaults, setSkippedSetupVaults] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    vaultIdRef.current = vaultId;
  }, [vaultId]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const refreshVaults = async (preferred?: string) => {
    const next = await window.vaultApi.list();
    setVaults(next);
    // Keep the current vault only if it still exists (it may have been removed),
    // otherwise fall back to the preferred one, then the first available.
    setVaultId((current) => {
      if (preferred) return preferred;
      if (current && next.some((vault) => vault.id === current)) return current;
      return next[0]?.id ?? null;
    });
  };

  useEffect(() => {
    refreshVaults()
      .catch((cause) => setError(String(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vaultId) {
      setManifest({ tree: [] });
      setTabs([]);
      tabsRef.current = [];
      setActiveId(null);
      activeIdRef.current = null;
      tabsInitializedRef.current = false;
      return;
    }
    window.vaultApi.watch(vaultId).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    window.vaultApi
      .manifest(vaultId)
      .then((next) => {
        const validIds = documentIds(next.tree);
        const hashId = decodeURIComponent(location.hash.slice(1));
        const pendingRequest =
          pendingOpenRequestRef.current?.vaultId === vaultId ? pendingOpenRequestRef.current : null;
        const prunedTabs = tabsRef.current.filter((tab) => validIds.has(tab.id));
        const currentActiveId = activeIdRef.current;
        const oldActiveIndex = tabsRef.current.findIndex((tab) => tab.id === currentActiveId);
        const initialId =
          !tabsInitializedRef.current && pendingRequest && validIds.has(pendingRequest.documentId)
            ? pendingRequest.documentId
            : !tabsInitializedRef.current && hashId && validIds.has(hashId)
              ? hashId
              : firstDocument(next.tree);
        let nextTabs = prunedTabs;
        let nextActiveId =
          currentActiveId && prunedTabs.some((tab) => tab.id === currentActiveId)
            ? currentActiveId
            : (prunedTabs[Math.max(0, Math.min(oldActiveIndex, prunedTabs.length - 1))]?.id ?? null);
        if (!nextActiveId && !tabsInitializedRef.current && initialId) {
          tabsInitializedRef.current = true;
          nextTabs = [{ id: initialId }];
          nextActiveId = initialId;
        }
        setManifest(next);
        setTabs(nextTabs);
        tabsRef.current = nextTabs;
        setActiveId(nextActiveId);
        activeIdRef.current = nextActiveId;
        if (pendingRequest && nextActiveId === pendingRequest.documentId) pendingOpenRequestRef.current = null;
        if (nextActiveId) location.hash = encodeURIComponent(nextActiveId);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [vaultId, version]);

  useEffect(() => {
    return window.vaultApi.onVaultChanged((changedVaultId) => {
      if (changedVaultId === vaultId) setVersion((value) => value + 1);
    });
  }, [vaultId]);

  const openDocument = useCallback((id: string) => {
    tabsInitializedRef.current = true;
    setTabs((current) => {
      if (current.some((tab) => tab.id === id)) return current;
      const activeIndex = current.findIndex((tab) => tab.id === activeIdRef.current);
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : current.length;
      const next = [...current.slice(0, insertAt), { id }, ...current.slice(insertAt)];
      tabsRef.current = next;
      return next;
    });
    setActiveId(id);
    activeIdRef.current = id;
    location.hash = encodeURIComponent(id);
    setView("doc");
  }, []);

  const requestOpenDocument = useCallback(
    (request: DocumentOpenRequest) => {
      pendingOpenRequestRef.current = request;
      if (vaultIdRef.current !== request.vaultId) {
        setVaultId(request.vaultId);
        setTabs([]);
        tabsRef.current = [];
        setActiveId(null);
        activeIdRef.current = null;
        tabsInitializedRef.current = false;
        return;
      }
      openDocument(request.documentId);
      pendingOpenRequestRef.current = null;
    },
    [openDocument],
  );

  useEffect(() => {
    void window.vaultApi.pendingOpenDocument().then((request) => {
      if (request) requestOpenDocument(request);
    });
    return window.vaultApi.onOpenDocument(requestOpenDocument);
  }, [requestOpenDocument]);

  const closeDocument = useCallback((id: string) => {
    tabsInitializedRef.current = true;
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index === -1) return current;
      const next = current.filter((tab) => tab.id !== id);
      tabsRef.current = next;
      if (activeIdRef.current === id) {
        const nextActiveId = next[index]?.id ?? next[index - 1]?.id ?? null;
        setActiveId(nextActiveId);
        activeIdRef.current = nextActiveId;
        if (nextActiveId) location.hash = encodeURIComponent(nextActiveId);
        else history.replaceState(null, "", `${location.pathname}${location.search}`);
      }
      return next;
    });
  }, []);

  const closeAllDocuments = useCallback(() => {
    tabsInitializedRef.current = true;
    setTabs([]);
    tabsRef.current = [];
    setActiveId(null);
    activeIdRef.current = null;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }, []);

  const closeOtherDocuments = useCallback((id: string) => {
    tabsInitializedRef.current = true;
    setTabs((current) => {
      if (!current.some((tab) => tab.id === id)) return current;
      const next = [{ id }];
      tabsRef.current = next;
      setActiveId(id);
      activeIdRef.current = id;
      location.hash = encodeURIComponent(id);
      return next;
    });
  }, []);

  const closeDocumentsToLeft = useCallback((id: string) => {
    tabsInitializedRef.current = true;
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index <= 0) return current;
      const next = current.slice(index);
      tabsRef.current = next;
      if (!next.some((tab) => tab.id === activeIdRef.current)) {
        setActiveId(id);
        activeIdRef.current = id;
        location.hash = encodeURIComponent(id);
      }
      return next;
    });
  }, []);

  const closeDocumentsToRight = useCallback((id: string) => {
    tabsInitializedRef.current = true;
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index === -1 || index >= current.length - 1) return current;
      const next = current.slice(0, index + 1);
      tabsRef.current = next;
      if (!next.some((tab) => tab.id === activeIdRef.current)) {
        setActiveId(id);
        activeIdRef.current = id;
        location.hash = encodeURIComponent(id);
      }
      return next;
    });
  }, []);

  const addLocal = async () => {
    setError(null);
    try {
      const vault = await window.vaultApi.chooseLocal();
      if (vault) await refreshVaults(vault.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const sync = async () => {
    if (!vaultId) return;
    setSyncing(true);
    setError(null);
    try {
      await window.vaultApi.sync(vaultId);
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  };

  const savePdf = async () => {
    if (!vaultId || !activeId || view !== "doc") return;
    setSavingPdf(true);
    setError(null);
    try {
      await window.vaultApi.saveDocumentPdf(vaultId, activeId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingPdf(false);
    }
  };

  const copyDocumentPath = useCallback(
    async (documentId: string) => {
      if (!vaultId) return;
      setError(null);
      try {
        const filePath = await window.vaultApi.documentPath(vaultId, documentId);
        await navigator.clipboard.writeText(filePath);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [vaultId],
  );

  const ids = useMemo(() => documentIds(manifest.tree), [manifest.tree]);
  const displayTabs = useMemo(
    () => tabs.map((tab) => ({ id: tab.id, title: documentLabel(manifest.tree, tab.id) ?? tab.id })),
    [manifest.tree, tabs],
  );

  useEffect(() => {
    const onHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id && ids.has(id)) openDocument(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [ids, openDocument]);

  if (loading) return <CenteredMessage title="Loading vaults…" />;
  if (!vaultId) return <Onboarding onLocal={addLocal} onCloned={refreshVaults} error={error} />;

  const vault = vaults.find((candidate) => candidate.id === vaultId)!;
  const setupVault = vault.hasConfig === false && !skippedSetupVaults.has(vault.id) ? vault : null;
  const title = activeId ? documentLabel(manifest.tree, activeId) : null;

  return (
    <SidebarProvider>
      <AppSidebar
        tree={manifest.tree}
        activeId={activeId}
        onSelect={openDocument}
        onCopyPath={copyDocumentPath}
        vaultName={vault.name}
        vaults={vaults}
      />
      <SidebarInset>
        <AppHeader>
          <SidebarTrigger className="app-no-drag -ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="app-no-drag flex min-w-0 shrink items-center">
            <VaultSwitcher
              vaults={vaults}
              vaultId={vaultId}
              onSwitch={(id) => {
                setVaultId(id);
                setTabs([]);
                tabsRef.current = [];
                setActiveId(null);
                activeIdRef.current = null;
                tabsInitializedRef.current = false;
              }}
              onLocal={addLocal}
              onRefresh={async (preferred) => {
                await refreshVaults(preferred);
                // Bump the version so the manifest re-fetches even when the
                // active vault is unchanged (e.g. after editing folder titles).
                setVersion((value) => value + 1);
              }}
            />
          </div>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            {view === "graph" ? "Graph" : title}
          </span>
          <div className="app-no-drag app-header-actions flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" title="Sync vault" onClick={sync} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
            </Button>
            <QuickNotesPanel vaultId={vaultId} version={version} />
            <Button
              className="app-header-secondary-action"
              variant="ghost"
              size="icon"
              title="Save document as PDF"
              aria-label="Save document as PDF"
              disabled={view !== "doc" || !activeId || savingPdf}
              onClick={savePdf}
            >
              <FileDown className={savingPdf ? "animate-pulse" : ""} />
            </Button>
            <Button
              className="app-header-secondary-action"
              variant={showBlame && view === "doc" ? "secondary" : "ghost"}
              size="icon"
              title={showBlame ? "Hide line history" : "Show line history"}
              aria-label={showBlame ? "Hide line history" : "Show line history"}
              aria-pressed={showBlame}
              disabled={view !== "doc" || !activeId}
              onClick={() => setShowBlame((value) => !value)}
            >
              <GitCommitHorizontal />
            </Button>
            <Button
              className="app-header-primary-action"
              variant={view === "graph" ? "secondary" : "ghost"}
              size="icon"
              title="Graph"
              onClick={() => setView(view === "graph" ? "doc" : "graph")}
            >
              <Network />
            </Button>
            <div className="app-header-secondary-action">
              <GuidedTour />
            </div>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </AppHeader>
        {error && (
          <div role="alert" className="border-destructive/50 bg-destructive/10 border-b px-4 py-2 text-sm">
            {error}
          </div>
        )}
        <main className="min-h-0 flex-1">
          {view === "graph" ? (
            <GraphView vaultId={vaultId} activeId={activeId} onSelect={openDocument} version={version} />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <DocumentTabs
                tabs={displayTabs}
                activeId={activeId}
                onSelect={openDocument}
                onClose={closeDocument}
                onCloseAll={closeAllDocuments}
                onCloseOthers={closeOtherDocuments}
                onCloseToLeft={closeDocumentsToLeft}
                onCloseToRight={closeDocumentsToRight}
                onCopyPath={copyDocumentPath}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                {activeId ? (
                  <DocumentView
                    vaultId={vaultId}
                    docId={activeId}
                    theme={theme}
                    version={version}
                    showBlame={showBlame}
                    documentIds={ids}
                    onNavigateDocument={openDocument}
                  />
                ) : (
                  <DocumentPicker tree={manifest.tree} onSelect={openDocument} />
                )}
              </div>
            </div>
          )}
        </main>
        <VaultInitDialog
          vault={setupVault}
          onSkip={(id) => setSkippedSetupVaults((current) => new Set(current).add(id))}
          onDone={async (preferred) => {
            await refreshVaults(preferred);
            setVersion((value) => value + 1);
          }}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

// The app header doubles as the draggable title bar. macOS needs left space for
// inset traffic lights; Windows needs a safe area for its native caption buttons.
function AppHeader({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const macOS = window.vaultApi.platform === "darwin";
  const windows = window.vaultApi.platform === "win32";
  return (
    <header
      className={cn(
        "app-drag app-header bg-background sticky top-0 z-10 flex h-14 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b pr-4 transition-[padding] duration-200 ease-linear",
        macOS && state === "collapsed" ? "pl-20" : "pl-4",
        windows && "app-titlebar-safe-right",
      )}
    >
      {children}
    </header>
  );
}

// Draggable strip for screens without the header (onboarding, loading) so the
// custom title-bar area can still move the window.
function WindowDragStrip() {
  return (
    <div className={cn("app-drag fixed inset-x-0 top-0 z-50", window.vaultApi.platform === "win32" ? "h-14" : "h-9")} />
  );
}

function Onboarding({
  onLocal,
  onCloned,
  error,
}: {
  onLocal: () => Promise<void>;
  onCloned: (preferred?: string) => Promise<void>;
  error: string | null;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<VaultFormat>("html");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const run = async (action: () => Promise<{ id: string }>) => {
    setBusy(true);
    setLocalError(null);
    try {
      const vault = await action();
      await onCloned(vault.id);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const clone = () => run(() => window.vaultApi.clone(url.trim()));
  const create = () => run(() => window.vaultApi.createEmpty(name.trim(), format));
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
      <WindowDragStrip />
      <div className="bg-card w-full max-w-lg rounded-xl border p-8 shadow-sm">
        <Database className="text-primary mb-4 size-10" />
        <h1 className="text-2xl font-semibold">Open a data vault</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Connect your GitHub account to open an existing vault or create a new one — no Git setup required.
        </p>
        <Button className="mt-6 w-full" size="lg" onClick={() => setConnectOpen(true)}>
          <Github />
          Connect to GitHub
        </Button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground mx-auto mt-4 block text-xs underline-offset-4 hover:underline"
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? "Hide advanced options" : "Advanced: open by Git URL or local folder"}
        </button>
        {showAdvanced && (
          <div className="mt-4 border-t pt-4">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/company/vault.git"
              />
              <Button variant="outline" onClick={clone} disabled={!url.trim() || busy}>
                <GitBranch />
                {busy ? "Cloning…" : "Clone"}
              </Button>
            </div>
            <div className="my-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">OR</span>
              <Separator className="flex-1" />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New vault name" />
              <select
                aria-label="Document format"
                value={format}
                onChange={(event) => setFormat(event.target.value as VaultFormat)}
                className="border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs outline-none"
              >
                <option value="html">HTML</option>
                <option value="markdown">Markdown</option>
              </select>
              <Button variant="outline" onClick={create} disabled={!name.trim() || busy}>
                <Plus />
                {busy ? "Creating…" : "Create"}
              </Button>
            </div>
            <div className="my-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">OR</span>
              <Separator className="flex-1" />
            </div>
            <Button variant="outline" className="w-full" onClick={onLocal}>
              <FolderOpen />
              Open local repository
            </Button>
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <UpdateButton showLabel />
        </div>
        {(error || localError) && (
          <p role="alert" className="text-destructive mt-4 whitespace-pre-wrap text-sm">
            {localError || error}
          </p>
        )}
      </div>
      <GithubConnectDialog open={connectOpen} onOpenChange={setConnectOpen} onDone={onCloned} />
    </div>
  );
}

function CenteredMessage({ title }: { title: string }) {
  return (
    <div className="text-muted-foreground flex min-h-screen items-center justify-center">
      <WindowDragStrip />
      {title}
    </div>
  );
}
