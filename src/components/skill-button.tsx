import { useEffect, useState } from "react";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SkillStatus, VaultSummary } from "@/types";

const initialStatus: SkillStatus = { state: "not-installed", version: "", vaultCount: 0 };

function headline(status: SkillStatus): string {
  switch (status.state) {
    case "current": return "Agent skill is up to date";
    case "outdated": return "Agent skill needs updating";
    default: return "Install the agent skill";
  }
}

function detail(status: SkillStatus): string {
  switch (status.state) {
    case "current":
      return `Claude and Codex know about your ${status.vaultCount} vault${status.vaultCount === 1 ? "" : "s"}.`;
    case "outdated":
      return "Your vault list changed. Re-install so Claude and Codex see the latest vaults.";
    default:
      return "Teach Claude and Codex how to read and edit your vaults, with the current vault list.";
  }
}

export function SkillButton({ vaults }: { vaults: VaultSummary[] }) {
  const [status, setStatus] = useState(initialStatus);
  const [open, setOpen] = useState(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          title="Set up Claude & Codex skill"
          aria-label={`Set up Claude and Codex skill${stale ? " — update available" : ""}`}
        >
          <Sparkles />
          {stale && (
            <span
              aria-hidden
              className="bg-destructive absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">
            {status.state === "current" ? <Check /> : <Sparkles />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{headline(status)}</p>
            <p className="text-muted-foreground mt-0.5 text-xs break-words">{detail(status)}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant={stale ? "default" : "outline"} onClick={install} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {busy
              ? "Installing…"
              : status.state === "not-installed"
                ? "Install skill"
                : status.state === "outdated"
                  ? "Update skill"
                  : "Re-install"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
