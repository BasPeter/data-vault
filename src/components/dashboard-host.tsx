import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, Shield, Square } from "lucide-react";
import type { DashboardManifest, DashboardRuntimeHostStatus } from "@/dashboard-contracts";
import { Button } from "@/components/ui/button";

type Props = {
  vaultId: string;
  dashboard: DashboardManifest;
  version: number;
  onManageAccess: () => void;
};

export function DashboardHost({ vaultId, dashboard, version, onManageAccess }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<DashboardRuntimeHostStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const reportBounds = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    void window.vaultApi.setDashboardContentBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    void window.vaultApi.setDashboardBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }, []);

  const open = useCallback(async () => {
    void version;
    setError(null);
    setStatus({ runtimeId: "", status: "loading", attached: false });
    try {
      await window.vaultApi.openDashboard(vaultId, dashboard.id);
      reportBounds();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [dashboard.id, reportBounds, vaultId, version]);

  useEffect(() => {
    let current = true;
    void open();
    const interval = window.setInterval(() => {
      void window.vaultApi.dashboardRuntimeStatus().then((next) => {
        if (current)
          setStatus(
            (previous) =>
              next ??
              (previous?.status === "loading" ? previous : { runtimeId: "", status: "stopped", attached: false }),
          );
      });
    }, 300);
    const resume = () => reportBounds();
    window.addEventListener("dashboard-host-resume", resume);
    return () => {
      current = false;
      window.clearInterval(interval);
      window.removeEventListener("dashboard-host-resume", resume);
      void window.vaultApi.stopDashboard();
    };
  }, [open, reportBounds]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const observer = new ResizeObserver(reportBounds);
    observer.observe(element);
    window.addEventListener("resize", reportBounds);
    reportBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportBounds);
    };
  }, [reportBounds]);

  const unavailable =
    error || status?.status === "failed" || status?.status === "unresponsive" || status?.status === "stopped";
  const copyAgentHandoff = async () => {
    setCopyStatus("idle");
    try {
      const handoff = await window.vaultApi.dashboardAgentHandoff(vaultId, dashboard.id);
      await navigator.clipboard.writeText(handoff);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };
  return (
    <section className="relative h-full min-h-0" aria-label={`${dashboard.title} dashboard`}>
      <div className="flex h-11 items-center justify-between border-b px-3">
        <span className="truncate text-sm font-medium">{dashboard.title}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyAgentHandoff}>
            <Copy />{" "}
            {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy agent handoff"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onManageAccess}>
            <Shield /> Manage access
          </Button>
          <Button variant="ghost" size="icon" title="Reload dashboard" aria-label="Reload dashboard" onClick={open}>
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Stop dashboard"
            aria-label="Stop dashboard"
            onClick={() => {
              void window.vaultApi.stopDashboard();
              setStatus({ runtimeId: "", status: "stopped", attached: false });
            }}
          >
            <Square />
          </Button>
        </div>
      </div>
      <div ref={hostRef} data-testid="dashboard-host" className="absolute inset-x-0 bottom-0 top-11" />
      {unavailable && (
        <div className="bg-background absolute inset-x-0 bottom-0 top-11 z-10 grid place-items-center p-8 text-center">
          <div>
            <h2 className="font-semibold">
              {status?.status === "stopped" ? "Dashboard stopped" : "Dashboard unavailable"}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm">
              {error ??
                (status?.status === "stopped"
                  ? "The dashboard is no longer running."
                  : "The dashboard stopped responding.")}
            </p>
            <Button className="mt-4" onClick={open}>
              Retry
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
