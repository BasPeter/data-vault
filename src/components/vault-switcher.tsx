import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronsUpDown, FolderOpen, FolderTree, GitBranch, Github, Plus, RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { VaultStructureEditor } from "@/components/vault-structure-editor";
import { cn } from "@/lib/utils";
import type { GitHubLoginStart, GitHubRepo, GitHubStatus, TreeNode, VaultStructure, VaultSummary, VaultUpdate } from "@/types";

type VaultSwitcherProps = {
  vaults: VaultSummary[];
  vaultId: string;
  onSwitch: (id: string) => void;
  onLocal: () => Promise<void> | void;
  onRefresh: (preferred?: string) => Promise<void>;
  onReset: () => Promise<void>;
};

export function VaultSwitcher({ vaults, vaultId, onSwitch, onLocal, onRefresh, onReset }: VaultSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"github" | "create" | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [settingsVault, setSettingsVault] = useState<VaultSummary | null>(null);
  const active = vaults.find((vault) => vault.id === vaultId);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" data-testid="vault-switcher" className="max-w-52 justify-between gap-2">
            <span className="truncate">{active?.name ?? "Select vault"}</span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          <div className="max-h-64 overflow-auto">
            {vaults.map((vault) => (
              <div key={vault.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="hover:bg-accent flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                  onClick={() => {
                    onSwitch(vault.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4 shrink-0", vault.id === vaultId ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{vault.name}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Vault settings"
                  onClick={() => {
                    setSettingsVault(vault);
                    setOpen(false);
                  }}
                >
                  <Settings />
                </Button>
              </div>
            ))}
          </div>
          <Separator className="my-1" />
          <ActionItem
            icon={<GitBranch />}
            label="Add from GitHub…"
            onClick={() => {
              setDialog("github");
              setOpen(false);
            }}
          />
          <ActionItem
            icon={<FolderOpen />}
            label="Add local vault…"
            onClick={() => {
              setOpen(false);
              void onLocal();
            }}
          />
          <ActionItem
            icon={<Plus />}
            label="Create empty vault…"
            onClick={() => {
              setDialog("create");
              setOpen(false);
            }}
          />
          <Separator className="my-1" />
          <ActionItem
            icon={<RotateCcw />}
            label="Reset app…"
            onClick={() => {
              setResetOpen(true);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <GithubImportDialog
        open={dialog === "github"}
        onOpenChange={(next) => setDialog(next ? "github" : null)}
        onDone={onRefresh}
      />
      <CreateEmptyDialog
        open={dialog === "create"}
        onOpenChange={(next) => setDialog(next ? "create" : null)}
        onDone={onRefresh}
      />
      <VaultSettingsDialog
        vault={settingsVault}
        onOpenChange={(next) => !next && setSettingsVault(null)}
        onDone={onRefresh}
      />
      <ResetVaultsDialog open={resetOpen} onOpenChange={setResetOpen} onReset={onReset} />
    </>
  );
}

function ActionItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ResetVaultsDialog({
  open,
  onOpenChange,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onReset();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setError(null); onOpenChange(next); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset app</DialogTitle>
          <DialogDescription>
            Forget all registered vaults and return to the first-start screen. Local folders and GitHub repositories are not deleted.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            <RotateCcw />{busy ? "Resetting..." : "Reset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GithubImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (preferred?: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<GitHubStatus>({ authenticated: false });
  const [login, setLogin] = useState<GitHubLoginStart | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    void window.vaultApi.githubStatus()
      .then(async (next) => {
        if (!active) return;
        setStatus(next);
        if (next.authenticated) {
          const list = await window.vaultApi.githubRepos();
          if (active) setRepos(list);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [open]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const start = await window.vaultApi.githubLoginStart();
      setLogin(start);
      const next = await window.vaultApi.githubLoginComplete();
      setStatus(next);
      setLogin(null);
      setRepos(await window.vaultApi.githubRepos());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const cloneSelected = async () => {
    setBusy(true);
    setError(null);
    try {
      const vault = await window.vaultApi.cloneGitHubRepo(selected);
      await onDone(vault.id);
      setSelected("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const createRepository = async () => {
    setBusy(true);
    setError(null);
    try {
      const vault = await window.vaultApi.createGitHubVault({
        name: name.trim(),
        private: isPrivate,
        description: description.trim() || undefined,
      });
      await onDone(vault.id);
      setName("");
      setDescription("");
      setIsPrivate(true);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const filtered = repos.filter((repo) => {
    const needle = query.trim().toLowerCase();
    return !needle || repo.fullName.toLowerCase().includes(needle) || repo.description?.toLowerCase().includes(needle);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setError(null); onOpenChange(next); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add vault from GitHub</DialogTitle>
          <DialogDescription>
            {status.authenticated ? `Connected as ${status.login}` : "Connect GitHub to use or create a vault repository."}
          </DialogDescription>
        </DialogHeader>
        {!status.authenticated ? (
          <div className="flex flex-col gap-3">
            <Button onClick={connect} disabled={busy} className="self-start">
              <Github />{busy ? "Connecting..." : "Connect GitHub"}
            </Button>
            {login && (
              <div className="border-border rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">Enter this code at GitHub</div>
                <div className="mt-1 font-mono text-lg font-semibold">{login.userCode}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="bg-muted flex rounded-md p-1">
              <Button variant={mode === "existing" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMode("existing")}>
                <GitBranch />Existing repo
              </Button>
              <Button variant={mode === "create" ? "secondary" : "ghost"} className="flex-1" onClick={() => setMode("create")}>
                <Plus />New repo
              </Button>
            </div>
            {mode === "existing" ? (
              <>
                <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search repositories" />
                <div className="border-border max-h-72 overflow-y-auto rounded-md border">
                  {filtered.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      className={cn(
                        "hover:bg-accent flex w-full items-start gap-3 px-3 py-2 text-left text-sm",
                        selected === repo.fullName && "bg-accent",
                      )}
                      onClick={() => setSelected(repo.fullName)}
                    >
                      <Check className={cn("mt-0.5 size-4 shrink-0", selected === repo.fullName ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{repo.fullName}</span>
                        {repo.description && <span className="text-muted-foreground line-clamp-2 block">{repo.description}</span>}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">{repo.private ? "private" : "public"}</span>
                    </button>
                  ))}
                  {filtered.length === 0 && <div className="text-muted-foreground px-3 py-6 text-center text-sm">No repositories found.</div>}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="vault-name"
                />
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Description"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
                  Private repository
                </label>
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {status.authenticated && mode === "existing" && (
            <Button onClick={cloneSelected} disabled={!selected || busy}>
              <GitBranch />{busy ? "Cloning..." : "Use repository"}
            </Button>
          )}
          {status.authenticated && mode === "create" && (
            <Button onClick={createRepository} disabled={!name.trim() || busy}>
              <Plus />{busy ? "Creating..." : "Create repository"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEmptyDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (preferred?: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const vault = await window.vaultApi.createEmpty(name.trim());
      await onDone(vault.id);
      setName("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setError(null); onOpenChange(next); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create empty vault</DialogTitle>
          <DialogDescription>Start a new local vault repository. You can add a remote later in vault settings.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && name.trim() && !busy) void submit(); }}
          placeholder="My vault"
        />
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>
            <Plus />{busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function countDirectories(structure: VaultStructure): number {
  return Object.values(structure).reduce(
    (total, meta) => total + 1 + (meta.children ? countDirectories(meta.children) : 0),
    0,
  );
}

function VaultSettingsDialog({
  vault,
  onOpenChange,
  onDone,
}: {
  vault: VaultSummary | null;
  onOpenChange: (open: boolean) => void;
  onDone: (preferred?: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("");
  const [structure, setStructure] = useState<VaultStructure>({});
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [view, setView] = useState<"settings" | "structure">("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  // Reset fields whenever a vault is opened, and clear the key on close so
  // reopening the same vault re-initialises from its latest values.
  if (vault && vault.id !== key) {
    setKey(vault.id);
    setName(vault.name);
    setRemoteUrl(vault.remoteUrl ?? "");
    setDefaultLanguage(vault.defaultLanguage ?? "");
    setStructure(vault.structure ?? {});
    setTree([]);
    setView("settings");
    setError(null);
    setNotice(null);
  } else if (!vault && key !== null) {
    setKey(null);
  }

  // Load the folder tree so the structure editor can surface existing
  // directories alongside the planned blueprint.
  useEffect(() => {
    if (!vault) return;
    let active = true;
    void window.vaultApi
      .manifest(vault.id)
      .then((manifest) => {
        if (active) setTree(manifest.tree);
      })
      .catch(() => {
        if (active) setTree([]);
      });
    return () => {
      active = false;
    };
  }, [vault]);

  const submit = async () => {
    if (!vault) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const update: VaultUpdate = {};
      if (name.trim() !== vault.name) update.name = name.trim();
      if (remoteUrl.trim() && remoteUrl.trim() !== (vault.remoteUrl ?? "")) update.remoteUrl = remoteUrl.trim();
      if (defaultLanguage.trim() !== (vault.defaultLanguage ?? "")) update.defaultLanguage = defaultLanguage.trim();
      if (JSON.stringify(structure) !== JSON.stringify(vault.structure ?? {})) update.structure = structure;
      if (Object.keys(update).length === 0) {
        onOpenChange(false);
        return;
      }
      const result = await window.vaultApi.updateVault(vault.id, update);
      await onDone(result.vault.id);
      if (result.push && !result.push.ok) {
        setNotice(`Saved, but the push failed: ${result.push.message ?? "unknown error"}`);
      } else {
        onOpenChange(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const directoryCount = countDirectories(structure);

  return (
    <Dialog open={vault !== null} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className={cn("max-h-[85vh] overflow-y-auto", view === "structure" && "sm:max-w-2xl")}>
        {view === "settings" ? (
          <>
            <DialogHeader>
              <DialogTitle>Vault settings</DialogTitle>
              <DialogDescription>Setting a remote configures origin and pushes using your system Git credentials.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="vault-name">Name</label>
              <Input id="vault-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="My vault" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="vault-remote">Remote URL</label>
              <Input
                id="vault-remote"
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="git@github.com:you/vault.git"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="vault-language">Default language</label>
              <Input
                id="vault-language"
                value={defaultLanguage}
                onChange={(event) => setDefaultLanguage(event.target.value)}
                placeholder="en"
              />
              <p className="text-muted-foreground text-xs">Language tag suggested to Claude and Codex when writing documents.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Desired structure</span>
              <p className="text-muted-foreground text-xs">
                Describe the directory layout this vault should grow into. Shared with Claude and Codex when they write documents.
              </p>
              <Button variant="outline" className="justify-start" onClick={() => setView("structure")}>
                <FolderTree />
                Set up desired structure
                <span className="text-muted-foreground ml-auto text-xs">
                  {directoryCount > 0 ? `${directoryCount} ${directoryCount === 1 ? "directory" : "directories"}` : "none yet"}
                </span>
              </Button>
            </div>
            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            {notice && <p role="alert" className="text-sm text-amber-600 dark:text-amber-500">{notice}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" aria-label="Back to settings" onClick={() => setView("settings")}>
                  <ArrowLeft />
                </Button>
                <DialogTitle>Desired structure</DialogTitle>
              </div>
              <DialogDescription>
                Add, nest, and describe directories. Copy an AI prompt to have an agent draft this from your documents.
              </DialogDescription>
            </DialogHeader>
            {vault && <VaultStructureEditor vault={vault} tree={tree} structure={structure} onChange={setStructure} />}
            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            {notice && <p role="alert" className="text-sm text-amber-600 dark:text-amber-500">{notice}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setView("settings")} disabled={busy}>
                <ArrowLeft />Back
              </Button>
              <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
