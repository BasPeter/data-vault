import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkillStatus, VaultSummary } from "@/types";

function headline(status: SkillStatus): string {
  switch (status.state) {
    case "current": return "Agent skills are up to date";
    case "outdated": return "Agent skills need updating";
    default: return "Set up agent skills";
  }
}

function detail(status: SkillStatus): string {
  switch (status.state) {
    case "current":
      return `Claude and Codex can read, edit, and review your ${status.vaultCount} vault${status.vaultCount === 1 ? "" : "s"}.`;
    case "outdated":
      return "Your vault list changed. Re-install so Claude and Codex see the latest vaults.";
    default:
      return "Teach Claude and Codex how to read, edit, and review your vaults, with the current vault list.";
  }
}

function actionLabel(status: SkillStatus, busy: boolean): string {
  if (busy) return "Installing…";
  switch (status.state) {
    case "not-installed": return "Install skills";
    case "outdated": return "Update skills";
    default: return "Re-install skills";
  }
}

// Keep the healthy state compact; only spend sidebar space on setup, updates,
// or an error that needs the user's attention.
export function AgentSkillsPanel({ vaults }: { vaults: VaultSummary[] }) {
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(() => {
    window.vaultApi.skillStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setStatusError(false);
      })
      .catch(() => setStatusError(true));
  }, []);

  // Re-check whenever the registered vaults change so the stale indicator
  // appears after a vault is added, removed, or renamed.
  const signature = vaults.map((vault) => `${vault.id}:${vault.name}:${vault.repositoryPath}:${vault.remoteUrl ?? ""}`).join("|");
  useEffect(() => {
    refreshStatus();
    window.addEventListener("focus", refreshStatus);
    return () => window.removeEventListener("focus", refreshStatus);
  }, [signature, refreshStatus]);

  const stale = statusError || (status !== null && status.state !== "current");

  const install = async () => {
    setBusy(true);
    try {
      setStatus(await window.vaultApi.installSkills());
      setStatusError(false);
    } catch {
      // Leave the previous status; the button stays available to retry.
    } finally {
      setBusy(false);
    }
  };

  if (!status && !statusError) {
    return (
      <div className="text-muted-foreground flex h-9 items-center gap-2 px-2 text-xs">
        <RefreshCw className="size-4 animate-spin" />
        <span>Checking agent skills…</span>
      </div>
    );
  }

  if (status?.state === "current" && !statusError) {
    return (
      <div className="text-muted-foreground flex h-9 items-center gap-2 px-2 text-xs">
        <Check className="size-4" />
        <span>Agent skills are up to date</span>
      </div>
    );
  }

  return (
    <div className="bg-sidebar-accent/40 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">
          {statusError ? <TriangleAlert /> : <Sparkles />}
        </span>
        <p className="text-sm font-medium">
          {statusError ? "Could not check agent skills" : headline(status!)}
        </p>
        {stale && (
          <span
            aria-hidden
            className="bg-destructive ml-auto size-2 shrink-0 rounded-full"
          />
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
        {statusError ? "Try the check again. If the problem continues, the skills may not be writable." : detail(status!)}
      </p>
      <p className="text-muted-foreground/80 mt-1.5 text-xs leading-relaxed">
        Installs the <span className="font-medium">vault-guide</span> and{" "}
        <span className="font-medium">document-reviewer</span> skills for Claude Code and Codex.
      </p>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant="default"
        onClick={statusError ? refreshStatus : install}
        disabled={busy}
      >
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {statusError ? "Check again" : actionLabel(status!, busy)}
      </Button>
    </div>
  );
}
