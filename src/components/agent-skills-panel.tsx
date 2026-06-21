import { useEffect, useState } from "react";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkillStatus, VaultSummary } from "@/types";

const initialStatus: SkillStatus = { state: "not-installed", version: "", vaultCount: 0 };

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

// Renders inside the collapsible sidebar footer, where the extra space lets the
// agent-skill installer explain what it does rather than hiding behind an icon.
export function AgentSkillsPanel({ vaults }: { vaults: VaultSummary[] }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  // Re-check whenever the registered vaults change so the stale indicator
  // appears after a vault is added, removed, or renamed.
  const signature = vaults.map((vault) => `${vault.id}:${vault.name}:${vault.repositoryPath}:${vault.remoteUrl ?? ""}`).join("|");
  useEffect(() => {
    window.vaultApi.skillStatus().then(setStatus).catch(() => undefined);
  }, [signature]);

  const stale = status.state !== "current";

  const install = async () => {
    setBusy(true);
    try {
      setStatus(await window.vaultApi.installSkills());
    } catch {
      // Leave the previous status; the button stays available to retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-sidebar-accent/40 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">
          {status.state === "current" ? <Check /> : <Sparkles />}
        </span>
        <p className="text-sm font-medium">{headline(status)}</p>
        {stale && (
          <span
            aria-hidden
            className="bg-destructive ml-auto size-2 shrink-0 rounded-full"
          />
        )}
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">{detail(status)}</p>
      <p className="text-muted-foreground/80 mt-1.5 text-xs leading-relaxed">
        Installs the <span className="font-medium">vault-guide</span> and{" "}
        <span className="font-medium">document-reviewer</span> skills for Claude Code and Codex.
      </p>
      <Button
        className="mt-3 w-full"
        size="sm"
        variant={stale ? "default" : "outline"}
        onClick={install}
        disabled={busy}
      >
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {actionLabel(status, busy)}
      </Button>
    </div>
  );
}
