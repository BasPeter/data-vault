import { describe, expect, it, vi } from "vitest";
import { DashboardRuntimeController } from "./dashboard-runtime";
import type { WebContents } from "electron";

type ControllerSeam = {
  runtime: Record<string, unknown> | null;
  authority: Map<number, symbol>;
  window: { isDestroyed: () => boolean; webContents: unknown };
  services: { releaseState: ReturnType<typeof vi.fn> };
} & Pick<DashboardRuntimeController, "destroyFocusedCurrentGuest">;

const unavailable = "Dashboard trusted flow is unavailable.";

function setup() {
  const generation = Symbol("current");
  const owner = { id: 1, isDestroyed: () => false, focus: vi.fn() };
  const authority = new Map([[7, generation]]);
  const close = vi.fn(() => {
    expect(authority.size).toBe(0);
  });
  const contents = {
    id: 7,
    hostWebContents: owner,
    isDestroyed: () => false,
    getType: () => "webview",
    close,
  } as unknown as WebContents;
  const runtime = {
    generation,
    runtimeId: "runtime",
    contents,
    senderId: 7,
    active: true,
    status: "ready",
    expensiveReadInFlight: false,
    expensiveReadTimestamps: [],
    cleanups: [],
    externalLinkPromptGate: { cancel: vi.fn() },
  };
  const releaseState = vi.fn();
  const controller = Object.create(DashboardRuntimeController.prototype) as unknown as ControllerSeam;
  controller.runtime = runtime;
  controller.authority = authority;
  controller.window = { isDestroyed: () => false, webContents: owner };
  controller.services = { releaseState };
  return { controller, runtime, contents, owner, authority, close, releaseState };
}

describe("DashboardRuntimeController trusted-flow fallback", () => {
  it("invalidates authority before closing the exact current guest", () => {
    const { controller, runtime, contents, authority, close, releaseState } = setup();
    expect(controller.destroyFocusedCurrentGuest(contents)).toBe("runtime");
    expect(runtime.active).toBe(false);
    expect(authority.size).toBe(0);
    expect(close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
    expect(releaseState).toHaveBeenCalledWith("runtime");
    expect(controller.runtime).toBeNull();
  });

  it("rejects a stale or arbitrary guest without closing it", () => {
    const { controller, contents, authority, close } = setup();
    authority.clear();
    expect(() => controller.destroyFocusedCurrentGuest(contents)).toThrow(unavailable);
    expect(close).not.toHaveBeenCalled();
  });

  it("rejects a guest owned by another host", () => {
    const { controller, contents, close } = setup();
    Object.defineProperty(contents, "hostWebContents", { value: {} });
    expect(() => controller.destroyFocusedCurrentGuest(contents)).toThrow(unavailable);
    expect(close).not.toHaveBeenCalled();
  });
});
