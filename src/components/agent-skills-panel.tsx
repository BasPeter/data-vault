import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SkillStatus, VaultSummary } from "@/types";

function headline(status: SkillStatus): string {
  switch (status.state) {
    case "current":
      return "Agent skills are up to date";
    case "outdated":
      return "Agent skills need updating";
    default:
      return "Set up agent skills";
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
  if (busy) return "Installing...";
  switch (status.state) {
    case "not-installed":
      return "Install skills";
    case "outdated":
      return "Update skills";
    default:
      return "Re-install skills";
  }
}

function installedVersionLabel(version: string | null): string {
  if (version === null) return "Not installed";
  if (version === "mixed") return "Mixed";
  return `v${version}`;
}

function SkillStatusIcon({
  status,
  statusError,
  busy,
}: {
  status: SkillStatus | null;
  statusError: boolean;
  busy: boolean;
}) {
  if (busy) return <RefreshCw className="animate-spin" />;
  if (statusError) return <TriangleAlert />;
  if (status?.state === "current") return <Check />;
  return <Sparkles />;
}

// Keep the healthy state compact; only spend sidebar space on setup, updates,
// or an error that needs the user's attention.
export function AgentSkillsPanel({ vaults }: { vaults: VaultSummary[] }) {
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(() => {
    window.vaultApi
      .skillStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setStatusError(false);
      })
      .catch(() => setStatusError(true));
  }, []);

  // Re-check whenever the registered vaults change so the stale indicator
  // appears after a vault is added, removed, or renamed.
  const signature = vaults
    .map((vault) => `${vault.id}:${vault.name}:${vault.repositoryPath}:${vault.remoteUrl ?? ""}`)
    .join("|");
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
        <span>Checking agent skills...</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {status?.state === "current" && !statusError ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-9 w-full justify-start gap-2 px-2 text-xs font-normal"
            title="Agent skills are up to date"
          >
            <Check className="size-4" />
            <span>Agent skills are up to date</span>
          </Button>
        ) : (
          <button
            type="button"
            className="bg-sidebar-accent/40 hover:bg-sidebar-accent/60 w-full rounded-lg border p-3 text-left transition-colors"
            title={statusError ? "Could not check agent skills" : headline(status!)}
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground [&_svg]:size-4">
                {statusError ? <TriangleAlert /> : <Sparkles />}
              </span>
              <span className="text-sm font-medium">
                {statusError ? "Could not check agent skills" : headline(status!)}
              </span>
              {stale && <span aria-hidden className="bg-destructive ml-auto size-2 shrink-0 rounded-full" />}
            </div>
            <span className="text-muted-foreground mt-1.5 block text-xs leading-relaxed">
              {statusError
                ? "Try the check again. If the problem continues, the skills may not be writable."
                : detail(status!)}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">
            <SkillStatusIcon status={status} statusError={statusError} busy={busy} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {statusError ? "Could not check agent skills" : status ? headline(status) : "Checking agent skills..."}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {statusError
                ? "Try the check again. If the problem continues, the skills may not be writable."
                : status
                  ? detail(status)
                  : "Reading installed Claude and Codex skill markers."}
            </p>
          </div>
        </div>

        {status?.skills.length ? (
          <div className="mt-4 divide-y rounded-md border">
            {status.skills.map((skill) => (
              <div key={skill.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 p-3 text-xs">
                <p className="text-sm font-medium">{skill.label}</p>
                <p className="text-muted-foreground capitalize">{skill.state.replace("-", " ")}</p>
                <p className="text-muted-foreground">Installed: {installedVersionLabel(skill.installedVersion)}</p>
                <p className="text-muted-foreground tabular-nums">Latest: v{skill.latestVersion}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 rounded-md border p-3 text-xs">
            No installed skill details are available yet.
          </p>
        )}

        {(statusError || status?.state !== "current") && (
          <div className="mt-4 grid gap-2">
            {statusError ? (
              <Button size="sm" variant="outline" onClick={refreshStatus}>
                <RefreshCw />
                Check again
              </Button>
            ) : (
              <Button size="sm" onClick={install} disabled={busy}>
                <RefreshCw className={busy ? "animate-spin" : ""} />
                {status ? actionLabel(status, busy) : "Install skills"}
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
