import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, RefreshCw, Shield, Square } from "lucide-react";
import type { DashboardManifest, DashboardRuntimeHostStatus } from "@/dashboard-contracts";
import { Button } from "@/components/ui/button";

type Props = {
  vaultId: string;
  dashboard: DashboardManifest;
  version: number;
  onManageAccess: () => void;
  // Set while a trusted host flow (permission consent, secrets, create) is open.
  // The dashboard `<webview>` is a real DOM element, so hiding it with
  // `display:none` removes its pixels and its input/focus surface entirely for
  // the duration of the flow — the in-DOM equivalent of detaching the old native
  // view, and stronger than merely covering a still-live guest.
  hidden?: boolean;
};

export function DashboardHost({ vaultId, dashboard, version, onManageAccess, hidden = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [status, setStatus] = useState<DashboardRuntimeHostStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const removeWebview = useCallback(() => {
    const element = webviewRef.current;
    webviewRef.current = null;
    element?.remove();
  }, []);

  const open = useCallback(async () => {
    void version;
    setError(null);
    setStatus({ runtimeId: "", status: "loading", attached: false });
    // Removing the old element destroys the previous guest before main prepares a
    // new runtime, so authority for the old generation is gone before the reload.
    removeWebview();
    try {
      const descriptor = await window.vaultApi.openDashboard(vaultId, dashboard.id);
      const host = hostRef.current;
      if (!host) return;
      // Created imperatively rather than in JSX: the `partition` attribute is
      // fixed at attach time, so each runtime needs a fresh element, and main —
      // not this markup — forces the guest's sandboxed webPreferences and preload
      // through the `will-attach-webview` hook.
      const webview = document.createElement("webview");
      webview.setAttribute("partition", descriptor.partition);
      webview.setAttribute("src", descriptor.src);
      webview.setAttribute("data-testid", "dashboard-webview");
      webview.style.position = "absolute";
      webview.style.inset = "0";
      webview.style.width = "100%";
      webview.style.height = "100%";
      webview.style.display = hiddenRef.current ? "none" : "";
      host.appendChild(webview);
      webviewRef.current = webview;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [dashboard.id, removeWebview, vaultId, version]);

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
    return () => {
      current = false;
      window.clearInterval(interval);
      removeWebview();
      void window.vaultApi.stopDashboard();
    };
  }, [open, removeWebview]);

  // Toggle guest visibility for trusted flows. Blurring on hide moves keyboard
  // focus off the guest — a `<webview>` is a separate focus context, so the
  // trusted overlay cannot be relied on to reclaim focus from it on its own.
  useEffect(() => {
    const element = webviewRef.current;
    if (!element) return;
    element.style.display = hidden ? "none" : "";
    if (hidden) element.blur();
  }, [hidden, status]);

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
              removeWebview();
              void window.vaultApi.stopDashboard();
              setStatus({ runtimeId: "", status: "stopped", attached: false });
            }}
          >
            <Square />
          </Button>
        </div>
      </div>
      {/* bg-background is the floor: the webview paints over this region, so the
          area reads as the app background before the guest loads or after it stops. */}
      <div ref={hostRef} data-testid="dashboard-host" className="bg-background absolute inset-x-0 bottom-0 top-11" />
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
