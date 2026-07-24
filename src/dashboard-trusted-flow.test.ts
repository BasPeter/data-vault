import { describe, expect, it, vi } from "vitest";
import type { DashboardRuntimeHostStatus } from "@/dashboard-contracts";
import { prepareDashboardTrustedFlow } from "@/dashboard-trusted-flow";

const ready = (runtimeId: string): NonNullable<DashboardRuntimeHostStatus> => ({
  runtimeId,
  status: "ready",
  attached: true,
});

function fixture(statuses: DashboardRuntimeHostStatus[] = [], disposition: "retained" | "destroyed" = "destroyed") {
  let time = 0;
  const order: string[] = [];
  const deps = {
    prepare: vi.fn(async () => {
      order.push("prepare");
      return { disposition, runtimeId: "old-runtime" };
    }),
    hide: vi.fn(() => order.push("hide")),
    remount: vi.fn(() => order.push("remount")),
    status: vi.fn(async () => {
      order.push("status");
      return statuses.shift() ?? null;
    }),
    contextIsCurrent: vi.fn(() => true),
    canRemount: vi.fn(() => true),
    replacementIsHiddenAndInert: vi.fn(() => true),
    focusHost: vi.fn(() => order.push("focus")),
    now: () => time,
    wait: vi.fn(async () => {
      order.push("wait");
      time += 10;
    }),
    timeoutMs: 45,
  };
  return { deps, order };
}

describe("prepareDashboardTrustedFlow", () => {
  it("prepares and hides once without remounting or polling for retained", async () => {
    const { deps, order } = fixture([], "retained");
    await prepareDashboardTrustedFlow(deps);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(deps.hide).toHaveBeenCalledTimes(1);
    expect(deps.remount).not.toHaveBeenCalled();
    expect(deps.status).not.toHaveBeenCalled();
    expect(order).toEqual(["prepare", "hide"]);
  });

  it("remounts once after hiding and gates focus on a different attached-ready runtime", async () => {
    const { deps, order } = fixture([
      null,
      ready("old-runtime"),
      { runtimeId: "replacement", status: "loading", attached: true },
      ready("replacement"),
    ]);
    await prepareDashboardTrustedFlow(deps);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(deps.hide).toHaveBeenCalledTimes(1);
    expect(deps.remount).toHaveBeenCalledTimes(1);
    expect(deps.status).toHaveBeenCalledTimes(4);
    expect(deps.replacementIsHiddenAndInert).toHaveBeenCalledTimes(1);
    expect(order.indexOf("hide")).toBeLessThan(order.indexOf("remount"));
    expect(order.at(-1)).toBe("focus");
  });

  it("never prepares a second time across replacement polls", async () => {
    const { deps } = fixture([null, null, ready("replacement")]);
    await prepareDashboardTrustedFlow(deps);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(deps.status).toHaveBeenCalledTimes(3);
  });

  it("times out closed while the same runtime remains ready", async () => {
    const { deps } = fixture([ready("old-runtime"), ready("old-runtime"), ready("old-runtime")]);
    await expect(prepareDashboardTrustedFlow(deps)).rejects.toThrow("readiness timed out");
    expect(deps.focusHost).not.toHaveBeenCalled();
  });

  it("rejects a context change during a status poll", async () => {
    const { deps } = fixture([null]);
    deps.contextIsCurrent.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(prepareDashboardTrustedFlow(deps)).rejects.toThrow("context changed");
    expect(deps.focusHost).not.toHaveBeenCalled();
  });

  it("rejects a different ready replacement that is not hidden and input-inert", async () => {
    const { deps } = fixture([ready("replacement")]);
    deps.replacementIsHiddenAndInert.mockReturnValue(false);
    await expect(prepareDashboardTrustedFlow(deps)).rejects.toThrow("not hidden and input-disabled");
    expect(deps.focusHost).not.toHaveBeenCalled();
  });

  it.each(["failed", "stopped", "unresponsive"] as const)("rejects replacement status %s", async (status) => {
    const { deps } = fixture([{ runtimeId: "replacement", status, attached: true }]);
    await expect(prepareDashboardTrustedFlow(deps)).rejects.toThrow("did not become ready");
    expect(deps.focusHost).not.toHaveBeenCalled();
  });

  it("rejects destroyed preparation when the unchanged context cannot remount", async () => {
    const { deps } = fixture();
    deps.canRemount.mockReturnValue(false);
    await expect(prepareDashboardTrustedFlow(deps)).rejects.toThrow("did not match the active context");
    expect(deps.hide).toHaveBeenCalledTimes(1);
    expect(deps.remount).not.toHaveBeenCalled();
  });
});
