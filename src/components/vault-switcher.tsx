import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, FolderOpen, GitBranch, Plus, Settings } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { DirectoryMeta, TreeNode, VaultStructure, VaultSummary, VaultUpdate } from "@/types";

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

type FolderRow = { id: string; segment: string; depth: number; title: string; description: string };

function lookupMeta(structure: VaultStructure | undefined, id: string): DirectoryMeta | undefined {
  let level = structure;
  let meta: DirectoryMeta | undefined;
  for (const segment of id.split("/")) {
    meta = level?.[segment];
    if (!meta) return undefined;
    level = meta.children;
  }
  return meta;
}

function collectFolders(
  nodes: TreeNode[],
  structure: VaultStructure | undefined,
  depth = 0,
  out: FolderRow[] = [],
): FolderRow[] {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    const meta = lookupMeta(structure, node.id);
    out.push({
      id: node.id,
      segment: node.id.split("/").pop() ?? node.id,
      depth,
      title: meta?.title ?? "",
      description: meta?.description ?? "",
    });
    collectFolders(node.children, structure, depth + 1, out);
  }
  return out;
}

// Reconstruct the nested vault structure from the flat folder rows, creating
// intermediate directory nodes as needed so deeply nested entries are reachable.
function buildStructure(rows: FolderRow[]): VaultStructure {
  const structure: VaultStructure = {};
  for (const row of rows) {
    const title = row.title.trim();
    const description = row.description.trim();
    if (!title && !description) continue;
    const segments = row.id.split("/");
    let level = structure;
    segments.forEach((segment, index) => {
      const node = (level[segment] ??= {});
      if (index === segments.length - 1) {
        if (title) node.title = title;
        if (description) node.description = description;
      } else {
        level = node.children ??= {};
      }
    });
  }
  return structure;
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
  const [folders, setFolders] = useState<FolderRow[]>([]);
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
    setFolders([]);
    setError(null);
    setNotice(null);
  } else if (!vault && key !== null) {
    setKey(null);
  }

  // Load the folder tree for the opened vault and pre-fill each row from the
  // vault's saved structure metadata.
  useEffect(() => {
    if (!vault) return;
    let active = true;
    void window.vaultApi
      .manifest(vault.id)
      .then((manifest) => {
        if (active) setFolders(collectFolders(manifest.tree, vault.structure));
      })
      .catch(() => {
        if (active) setFolders([]);
      });
    return () => {
      active = false;
    };
  }, [vault]);

  const updateFolder = (id: string, patch: Partial<FolderRow>) =>
    setFolders((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

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
      const structure = buildStructure(folders);
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

  return (
    <Dialog open={vault !== null} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
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
        {folders.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Folder descriptions</span>
            <p className="text-muted-foreground text-xs">Give each directory a title and an optional description of what belongs there.</p>
            <div className="flex flex-col gap-3">
              {folders.map((folder) => (
                <div key={folder.id} className="flex flex-col gap-1.5" style={{ marginLeft: folder.depth * 12 }}>
                  <span className="text-muted-foreground font-mono text-xs">{folder.segment}/</span>
                  <Input
                    value={folder.title}
                    onChange={(event) => updateFolder(folder.id, { title: event.target.value })}
                    placeholder="Title"
                  />
                  <Input
                    value={folder.description}
                    onChange={(event) => updateFolder(folder.id, { description: event.target.value })}
                    placeholder="Description (optional)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        {notice && <p role="alert" className="text-sm text-amber-600 dark:text-amber-500">{notice}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
