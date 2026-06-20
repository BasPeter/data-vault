import { useEffect, useState } from "react";
import { Check, Download, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { UpdateStatus } from "@/types";

const initialStatus: UpdateStatus = { state: "idle", currentVersion: "" };

// States that mean a newer release than the installed one has been found.
const NEWER_STATES = ["available", "downloading", "downloaded"];
const BUSY_STATES = ["checking", "available", "downloading"];

function headline(status: UpdateStatus): string {
  switch (status.state) {
    case "checking": return "Checking for updates…";
    case "available": return `Version ${status.version ?? "…"} found`;
    case "downloading": return `Downloading version ${status.version ?? "…"}…`;
    case "downloaded": return `Version ${status.version ?? ""} is ready to install`.trim();
    case "not-available": return "You're up to date";
    case "error": return "Update check failed";
    default: return "Check for updates";
  }
}

function detail(status: UpdateStatus): string {
  switch (status.state) {
    case "downloading": return `${Math.round(status.percent ?? 0)}% downloaded`;
    case "downloaded": return "Data Vault will restart to finish installing.";
    case "error": return status.message ?? "Unknown error.";
    case "available": return "Downloading in the background…";
    default: return `Installed version ${status.currentVersion || "unknown"}.`;
  }
}

function StatusIcon({ status }: { status: UpdateStatus }) {
  if (BUSY_STATES.includes(status.state)) return <RefreshCw className="animate-spin" />;
  if (status.state === "downloaded") return <RotateCcw />;
  if (status.state === "not-available") return <Check />;
  if (status.state === "error") return <TriangleAlert />;
  return <Download />;
}

export function UpdateButton({ showLabel = false }: { showLabel?: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = window.vaultApi.onUpdateStatus(setStatus);
    window.vaultApi.updateStatus()
      .then(setStatus)
      .catch((cause) => setStatus({ state: "error", currentVersion: "", message: String(cause) }));
    return unsubscribe;
  }, []);

  const newer = NEWER_STATES.includes(status.state);
  const busy = BUSY_STATES.includes(status.state);
  const ready = status.state === "downloaded";
  const versionText = status.currentVersion ? `v${status.currentVersion}` : "Data Vault";
  const dotLabel = newer ? ` — update to version ${status.version ?? "available"}` : "";

  const recheck = () => {
    window.vaultApi.checkForUpdates()
      .catch((cause) => setStatus({ ...status, state: "error", message: cause instanceof Error ? cause.message : String(cause) }));
  };
  const installAndRestart = () => {
    window.vaultApi.installUpdate()
      .catch((cause) => setStatus({ ...status, state: "error", message: cause instanceof Error ? cause.message : String(cause) }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative font-normal tabular-nums"
          title={`Data Vault ${versionText}${dotLabel}`}
          aria-label={`Data Vault ${versionText}${dotLabel}`}
        >
          {showLabel ? `Data Vault ${versionText}` : versionText}
          {newer && (
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
            <StatusIcon status={status} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{headline(status)}</p>
            <p className="text-muted-foreground mt-0.5 text-xs break-words">{detail(status)}</p>
          </div>
        </div>

        {status.state === "downloading" && (
          <div className="bg-muted mt-3 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${Math.round(status.percent ?? 0)}%` }}
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {ready ? (
            <Button size="sm" onClick={installAndRestart}>
              <RotateCcw />
              Update and restart
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={recheck} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} />
              {busy ? "Checking…" : "Check for updates"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
