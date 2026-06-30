import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCopy, GitCompareArrows, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { VaultChange, VaultChangeStatus } from "@/types";

const EMPTY_STATUS: VaultChangeStatus = { changed: false, changes: [] };

function kindLabel(change: VaultChange): string {
  switch (change.kind) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "untracked":
      return "Untracked";
    case "conflicted":
      return "Conflict";
    default:
      return "Modified";
  }
}

function commitInstruction(repositoryPath: string, changes: VaultChange[]): string {
  const changeList = changes
    .map((change) => {
      const rename = change.previousPath ? ` from ${change.previousPath}` : "";
      return `- ${kindLabel(change)}: ${change.path}${rename}`;
    })
    .join("\n");

  return `You need to commit and push changes in this Data Vault content repository:
${repositoryPath}

The current shell may be in another repository. Before inspecting, committing, or pushing, set your command working directory to the Data Vault content repository path above, or run Git commands with git -C "${repositoryPath}". Do not commit from the Data Vault application repository or from any unrelated code repository. Do not search for a different repository unless the path above does not exist.

Please review the uncommitted changes, run the appropriate checks, create a focused commit, and push it to the configured remote.

Before committing:
- Confirm the repository path with pwd and git status.
- Confirm the listed document files exist in this repository.
- Inspect the working tree with git status and git diff.
- Keep the commit limited to the intended vault changes.
- Do not include local scratchpad files such as documents/quick-notes.html.
- Use a clear English Conventional Commits message, such as "feat: add vault change indicator" or "fix: correct vault status parsing".
- Push only after the commit succeeds.

Currently visible uncommitted changes:
${changeList}`;
}

export function VaultChangesIndicator({
  vaultId,
  repositoryPath,
  version,
}: {
  vaultId: string;
  repositoryPath: string;
  version: number;
}) {
  const [status, setStatus] = useState<VaultChangeStatus>(EMPTY_STATUS);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const openedVaultRef = useRef<string | null>(null);

  const refresh = useCallback(
    async (autoOpen = false) => {
      setBusy(true);
      try {
        const next = await window.vaultApi.changes(vaultId);
        setStatus(next);
        setError(null);
        if (autoOpen && next.changed && openedVaultRef.current !== vaultId) {
          openedVaultRef.current = vaultId;
          setOpen(true);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [vaultId],
  );

  useEffect(() => {
    setStatus(EMPTY_STATUS);
    setError(null);
    openedVaultRef.current = null;
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    void refresh(false);
  }, [refresh, version]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(false), 5000);
    const onFocus = () => void refresh(false);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const count = status.changes.length;
  const title = error
    ? "Could not check vault changes"
    : count
      ? `${count} uncommitted change${count === 1 ? "" : "s"}`
      : "No uncommitted changes";

  const copyInstruction = async () => {
    await navigator.clipboard.writeText(commitInstruction(repositoryPath, status.changes));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={count || error ? "secondary" : "ghost"}
          size="icon"
          title={title}
          aria-label={title}
          className="relative"
        >
          {busy ? <RefreshCw className="animate-spin" /> : <GitCompareArrows />}
          {(count > 0 || error) && (
            <span
              aria-hidden
              className="bg-destructive absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-background"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">
            {busy ? <RefreshCw className="animate-spin" /> : <GitCompareArrows />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {error
                ? error
                : count
                  ? "These files have changes that are not committed in the current vault."
                  : "The current vault working tree is clean."}
            </p>
          </div>
        </div>
        {count > 0 && (
          <>
            <div className="mt-4 max-h-72 overflow-auto rounded-md border">
              {status.changes.map((change) => (
                <div
                  key={`${change.kind}:${change.previousPath ?? ""}:${change.path}`}
                  className="grid gap-1 p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground shrink-0">{kindLabel(change)}</span>
                    <span className="min-w-0 truncate font-mono">{change.path}</span>
                  </div>
                  {change.previousPath && (
                    <p className="text-muted-foreground min-w-0 truncate font-mono">from {change.previousPath}</p>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-4 w-full" onClick={copyInstruction}>
              <ClipboardCopy />
              {copied ? "Copied commit instruction" : "Copy commit instruction"}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
