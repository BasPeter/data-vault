import { useEffect, useRef } from "react";

/**
 * A running dashboard is an Electron `WebContentsView` composited above the whole
 * renderer DOM, so anything drawn over its rectangle — a header popover dropping
 * down into the content area, a centred dialog — is invisible behind it. This is
 * not a stacking-context problem and no z-index fixes it; the native view has to
 * be detached while the overlay is open.
 *
 * Pass whether any overlay in the component is currently open. Deriving it from
 * state rather than wrapping each setter means an internal `setOpen(false)` or a
 * popover that hands off to a dialog cannot silently miss it.
 *
 * Suspending keeps the runtime alive (no reload, no lost dashboard state) and is
 * a no-op when no dashboard is running, so this is always safe to call.
 */
export function useDashboardOverlay(open: boolean): void {
  const runtimeId = useRef<string | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Serialised: toggling quickly must not resume before the matching suspend
    // has resolved, which would leave the view detached with no way back.
    const queue = (task: () => Promise<void>) => {
      pending.current = pending.current.then(task, task);
    };

    if (open) {
      queue(async () => {
        if (runtimeId.current) return;
        runtimeId.current = await window.vaultApi.suspendDashboard();
      });
      return;
    }

    queue(async () => {
      const current = runtimeId.current;
      runtimeId.current = null;
      if (!current) return;
      try {
        await window.vaultApi.resumeDashboard(current);
        window.dispatchEvent(new Event("dashboard-host-resume"));
      } catch {
        // Switching, removing, or reloading a dashboard deliberately invalidates
        // the old runtime generation.
      }
    });
  }, [open]);

  // An overlay can unmount while still open (vault switch, navigation); the view
  // must come back rather than staying detached.
  useEffect(
    () => () => {
      const current = runtimeId.current;
      runtimeId.current = null;
      if (!current) return;
      pending.current = pending.current.then(
        () => window.vaultApi.resumeDashboard(current).catch(() => undefined),
        () => undefined,
      );
      window.dispatchEvent(new Event("dashboard-host-resume"));
    },
    [],
  );
}
