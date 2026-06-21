import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronsUpDown, FolderOpen, FolderTree, GitBranch, Plus, Settings } from "lucide-react";
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
import type { TreeNode, VaultStructure, VaultSummary, VaultUpdate } from "@/types";

type VaultSwitcherProps = {
  vaults: VaultSummary[];
  vaultId: string;
  onSwitch: (id: string) => void;
  onLocal: () => Promise<void> | void;
  onRefresh: (preferred?: string) => Promise<void>;
};

export function VaultSwitcher({ vaults, vaultId, onSwitch, onLocal, onRefresh }: VaultSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"github" | "create" | null>(null);
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

function GithubImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (preferred?: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const vault = await window.vaultApi.clone(url.trim());
      await onDone(vault.id);
      setUrl("");
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
          <DialogTitle>Add vault from GitHub</DialogTitle>
          <DialogDescription>Clone a Git repository over HTTPS, SSH, or git@.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && url.trim() && !busy) void submit(); }}
          placeholder="https://github.com/company/vault.git"
        />
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!url.trim() || busy}>
            <GitBranch />{busy ? "Cloning…" : "Clone"}
          </Button>
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
