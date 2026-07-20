import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, Shield, Square } from "lucide-react";
import type { DashboardManifest, DashboardRuntimeHostStatus } from "@/dashboard-contracts";
import { Button } from "@/components/ui/button";
import { DASHBOARD_RESUME_EVENT, DASHBOARD_SUSPEND_EVENT } from "@/hooks/use-dashboard-overlay";

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
  // A still of the dashboard held while its native view is detached for an
  // overlay, so the region does not go black.
  const [snapshot, setSnapshot] = useState<string | null>(null);

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
    const resume = () => {
      setSnapshot(null);
      reportBounds();
    };
    const suspend = (event: Event) => setSnapshot((event as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(DASHBOARD_RESUME_EVENT, resume);
    window.addEventListener(DASHBOARD_SUSPEND_EVENT, suspend);
    return () => {
      current = false;
      window.clearInterval(interval);
      window.removeEventListener(DASHBOARD_RESUME_EVENT, resume);
      window.removeEventListener(DASHBOARD_SUSPEND_EVENT, suspend);
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
      {/* bg-background is the floor: the native view paints this region itself,
          so without it a detached view leaves the window's bare background. */}
      <div ref={hostRef} data-testid="dashboard-host" className="bg-background absolute inset-x-0 bottom-0 top-11" />
      {snapshot && (
        <img
          src={snapshot}
          alt=""
          aria-hidden
          data-testid="dashboard-snapshot"
          className="pointer-events-none absolute inset-x-0 bottom-0 top-11 size-full object-cover object-top opacity-70"
        />
      )}
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
