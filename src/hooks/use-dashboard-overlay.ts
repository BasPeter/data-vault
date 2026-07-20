import { useEffect, useRef } from "react";

export const DASHBOARD_SUSPEND_EVENT = "dashboard-host-suspend";
export const DASHBOARD_RESUME_EVENT = "dashboard-host-resume";

/**
 * Detaches the dashboard's native view, handing the host a still of it first.
 *
 * The still matters: the view paints the dashboard region itself, so once it is
 * detached nothing draws there and the user sees a black hole. Capturing before
 * detaching lets trusted UI keep a frozen frame in its place, so an overlay looks
 * like it opened over the dashboard rather than replacing it.
 */
export async function suspendDashboardForOverlay(): Promise<string | null> {
  const snapshot = await window.vaultApi.captureDashboard().catch(() => null);
  window.dispatchEvent(new CustomEvent(DASHBOARD_SUSPEND_EVENT, { detail: snapshot }));
  return window.vaultApi.suspendDashboard();
}

export async function resumeDashboardForOverlay(runtimeId: string): Promise<void> {
  try {
    await window.vaultApi.resumeDashboard(runtimeId);
  } catch {
    // Switching, removing, or reloading a dashboard deliberately invalidates the
    // old runtime generation.
  }
  // Fires either way: the host must drop the stale still and re-report bounds
  // even when the runtime it belonged to is gone.
  window.dispatchEvent(new Event(DASHBOARD_RESUME_EVENT));
}

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
        runtimeId.current = await suspendDashboardForOverlay();
      });
      return;
    }

    queue(async () => {
      const current = runtimeId.current;
      runtimeId.current = null;
      if (!current) return;
      await resumeDashboardForOverlay(current);
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
        () => resumeDashboardForOverlay(current),
        () => resumeDashboardForOverlay(current),
      );
    },
    [],
  );
}
