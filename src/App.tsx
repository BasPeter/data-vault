import { useEffect, useState } from "react";
import { Database, FolderOpen, GitBranch, Network, Plus, RefreshCw } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { DocumentView } from "@/components/document-view";
import { GraphView } from "@/components/graph-view";
import { GuidedTour } from "@/components/guided-tour";
import { QuickNotesPanel } from "@/components/quick-notes-panel";
import { VaultSwitcher } from "@/components/vault-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpdateButton } from "@/components/update-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { Manifest, TreeNode, VaultSummary } from "@/types";

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

export default function App() {
  const { theme, toggle } = useTheme();
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest>({ tree: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"doc" | "graph">("doc");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshVaults = async (preferred?: string) => {
    const next = await window.vaultApi.list();
    setVaults(next);
    setVaultId((current) => preferred || current || next[0]?.id || null);
  };

  useEffect(() => {
    refreshVaults().catch((cause) => setError(String(cause))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vaultId) {
      setManifest({ tree: [] });
      setActiveId(null);
      return;
    }
    window.vaultApi.manifest(vaultId)
      .then((next) => {
        setManifest(next);
        setActiveId((current) => current && documentLabel(next.tree, current) ? current : firstDocument(next.tree));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [vaultId, version]);

  useEffect(() => {
    const onHash = () => setActiveId(decodeURIComponent(location.hash.slice(1)) || null);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openDocument = (id: string) => {
    setActiveId(id);
    location.hash = encodeURIComponent(id);
    setView("doc");
  };

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

  if (loading) return <CenteredMessage title="Loading vaults…" />;
  if (!vaultId) return <Onboarding onLocal={addLocal} onCloned={refreshVaults} error={error} />;

  const vault = vaults.find((candidate) => candidate.id === vaultId)!;
  const title = activeId ? documentLabel(manifest.tree, activeId) : null;

  return (
    <SidebarProvider>
      <AppSidebar tree={manifest.tree} activeId={activeId} onSelect={openDocument} vaultName={vault.name} vaults={vaults} />
      <SidebarInset>
        <AppHeader>
          <SidebarTrigger className="app-no-drag -ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="app-no-drag flex min-w-0 items-center">
            <VaultSwitcher
              vaults={vaults}
              vaultId={vaultId}
              onSwitch={(id) => { setVaultId(id); setActiveId(null); }}
              onLocal={addLocal}
              onRefresh={async (preferred) => {
                await refreshVaults(preferred);
                // Bump the version so the manifest re-fetches even when the
                // active vault is unchanged (e.g. after editing folder titles).
                setVersion((value) => value + 1);
              }}
            />
          </div>
          <span className="text-muted-foreground truncate text-sm">{view === "graph" ? "Graph" : title}</span>
          <div className="app-no-drag ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Sync vault" onClick={sync} disabled={syncing}>
              <RefreshCw className={syncing ? "animate-spin" : ""} />
            </Button>
            <QuickNotesPanel vaultId={vaultId} version={version} />
            <Button variant={view === "graph" ? "secondary" : "ghost"} size="icon" title="Graph" onClick={() => setView(view === "graph" ? "doc" : "graph")}>
              <Network />
            </Button>
            <GuidedTour />
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </AppHeader>
        {error && <div role="alert" className="border-destructive/50 bg-destructive/10 border-b px-4 py-2 text-sm">{error}</div>}
        <main className="min-h-0 flex-1">
          {view === "graph" ? (
            <GraphView vaultId={vaultId} activeId={activeId} onSelect={openDocument} version={version} />
          ) : (
            <div className="h-full overflow-auto">
              <DocumentView vaultId={vaultId} docId={activeId} theme={theme} version={version} />
            </div>
          )}
        </main>
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
        "app-drag bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b pr-4 transition-[padding] duration-200 ease-linear",
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
    <div
      className={cn(
        "app-drag fixed inset-x-0 top-0 z-50",
        window.vaultApi.platform === "win32" ? "h-14" : "h-9",
      )}
    />
  );
}

function Onboarding({ onLocal, onCloned, error }: {
  onLocal: () => Promise<void>;
  onCloned: (preferred?: string) => Promise<void>;
  error: string | null;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
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
  const create = () => run(() => window.vaultApi.createEmpty(name.trim()));
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-6">
      <WindowDragStrip />
      <div className="bg-card w-full max-w-lg rounded-xl border p-8 shadow-sm">
        <Database className="text-primary mb-4 size-10" />
        <h1 className="text-2xl font-semibold">Open a data vault</h1>
        <p className="text-muted-foreground mt-2 text-sm">Clone a Git repository, open an existing local clone, or create a new vault.</p>
        <div className="mt-6 flex gap-2">
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/company/vault.git" />
          <Button onClick={clone} disabled={!url.trim() || busy}><GitBranch />{busy ? "Cloning…" : "Clone"}</Button>
        </div>
        <div className="my-5 flex items-center gap-3"><Separator className="flex-1" /><span className="text-muted-foreground text-xs">OR</span><Separator className="flex-1" /></div>
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New vault name" />
          <Button variant="outline" onClick={create} disabled={!name.trim() || busy}><Plus />{busy ? "Creating…" : "Create"}</Button>
        </div>
        <div className="my-5 flex items-center gap-3"><Separator className="flex-1" /><span className="text-muted-foreground text-xs">OR</span><Separator className="flex-1" /></div>
        <Button variant="outline" className="w-full" onClick={onLocal}><FolderOpen />Open local repository</Button>
        <div className="mt-3 flex justify-center"><UpdateButton showLabel /></div>
        {(error || localError) && <p role="alert" className="text-destructive mt-4 text-sm">{localError || error}</p>}
      </div>
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
