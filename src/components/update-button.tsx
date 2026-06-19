import { useEffect, useState } from "react";
import { Check, Download, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/types";

const initialStatus: UpdateStatus = { state: "idle", currentVersion: "" };

function label(status: UpdateStatus): string {
  switch (status.state) {
    case "checking": return "Checking for updates…";
    case "available": return `Downloading v${status.version ?? "…"}…`;
    case "downloading": return `Downloading v${status.version ?? "…"}… ${Math.round(status.percent ?? 0)}%`;
    case "downloaded": return `Install v${status.version ?? "the update"} and restart`;
    case "not-available": return `Data Vault v${status.currentVersion} is up to date`;
    case "error": return `Update failed: ${status.message ?? "Unknown error"}. Click to retry.`;
    default: return "Check for updates";
  }
}

function StatusIcon({ status }: { status: UpdateStatus }) {
  if (["checking", "available", "downloading"].includes(status.state)) return <RefreshCw className="animate-spin" />;
  if (status.state === "downloaded") return <RotateCcw />;
  if (status.state === "not-available") return <Check />;
  if (status.state === "error") return <TriangleAlert />;
  return <Download />;
}

export function UpdateButton({ showLabel = false }: { showLabel?: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  useEffect(() => {
    const unsubscribe = window.vaultApi.onUpdateStatus(setStatus);
    window.vaultApi.updateStatus().then(setStatus).catch((cause) => setStatus({ state: "error", currentVersion: "", message: String(cause) }));
    return unsubscribe;
  }, []);

  const busy = ["checking", "available", "downloading"].includes(status.state);
  const text = label(status);
  const activate = () => {
    const operation = status.state === "downloaded" ? window.vaultApi.installUpdate() : window.vaultApi.checkForUpdates();
    operation.catch((cause) => setStatus({ ...status, state: "error", message: cause instanceof Error ? cause.message : String(cause) }));
  };
  return (
    <Button variant="ghost" size={showLabel ? "default" : "icon"} title={text} aria-label={text} disabled={busy} onClick={activate}>
      <StatusIcon status={status} />
      {showLabel && text}
    </Button>
  );
}
