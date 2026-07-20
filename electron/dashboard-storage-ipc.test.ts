import { describe, expect, it, vi } from "vitest";
import { createDashboardStorageHandlers } from "./dashboard-storage-ipc";

function setup() {
  const trusted = { trusted: true };
  const service = {
    dashboards: vi.fn(() => []),
    createDashboard: vi.fn((_vaultId, input) => input),
    renameDashboard: vi.fn((_vaultId, dashboardId, title) => ({ dashboardId, title })),
    reorderDashboards: vi.fn((_vaultId, ids) => ids),
    removeDashboard: vi.fn((_vaultId, dashboardId) => ({ dashboardId, trashPath: "trash" })),
    moveDashboard: vi.fn((_vaultId, dashboardId, location) => ({ dashboardId, location })),
    dashboardAgentHandoff: vi.fn((_vaultId, dashboardId) => `handoff:${dashboardId}`),
  };
  const assertTrusted = vi.fn((event: unknown) => {
    if (event !== trusted) throw new Error("Untrusted IPC sender.");
  });
  const handlers = createDashboardStorageHandlers(assertTrusted, () => service as never);
  return { trusted, service, assertTrusted, handlers };
}

describe("dashboard storage IPC", () => {
  it("rejects the sender before parsing arguments or resolving the service", () => {
    const serviceGetter = vi.fn();
    const handlers = createDashboardStorageHandlers(() => {
      throw new Error("Untrusted IPC sender.");
    }, serviceGetter);
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("arguments inspected first");
        },
      },
    );

    expect(() => handlers.create({}, hostile, hostile)).toThrow("Untrusted IPC sender");
    expect(serviceGetter).not.toHaveBeenCalled();
  });

  it("validates exact create details before dispatch, including a strict storage location", () => {
    const { trusted, service, handlers } = setup();
    expect(() =>
      handlers.create(trusted, "vault", {
        title: "Dashboard",
        icon: "target",
        color: "blue",
        kind: "blank",
        location: "vault",
        injected: true,
      }),
    ).toThrow("Invalid dashboard details");
    expect(() =>
      handlers.create(trusted, "vault", { title: "Dashboard", icon: "target", color: "blue", kind: "blank" }),
    ).toThrow("Invalid dashboard details");
    expect(() =>
      handlers.create(trusted, "vault", {
        title: "Dashboard",
        icon: "target",
        color: "blue",
        kind: "blank",
        // Storage location is a trusted-boundary argument: only the exact
        // "vault"/"local" strings are valid, never a coerced or guessed value.
        location: "cloud",
      }),
    ).toThrow("Invalid dashboard storage location");
    expect(service.createDashboard).not.toHaveBeenCalled();

    handlers.create(trusted, "vault", {
      title: "Dashboard",
      icon: "target",
      color: "blue",
      kind: "blank",
      location: "local",
    });
    expect(service.createDashboard).toHaveBeenCalledWith("vault", {
      title: "Dashboard",
      icon: "target",
      color: "blue",
      kind: "blank",
      location: "local",
    });
  });

  it("bounds and validates lifecycle arguments before dispatch", () => {
    const { trusted, service, handlers } = setup();
    expect(() => handlers.rename(trusted, "vault", "dashboard", "")).toThrow("Invalid dashboard title");
    expect(() =>
      handlers.reorder(
        trusted,
        "vault",
        Array.from({ length: 1001 }, () => "id"),
      ),
    ).toThrow("Invalid dashboard order");
    expect(service.renameDashboard).not.toHaveBeenCalled();
    expect(service.reorderDashboards).not.toHaveBeenCalled();

    handlers.rename(trusted, "vault", "dashboard", "New title");
    handlers.reorder(trusted, "vault", ["second", "first"]);
    handlers.remove(trusted, "vault", "first");
    expect(service.renameDashboard).toHaveBeenCalledWith("vault", "dashboard", "New title");
    expect(service.reorderDashboards).toHaveBeenCalledWith("vault", ["second", "first"]);
    expect(service.removeDashboard).toHaveBeenCalledWith("vault", "first");
  });

  it("rejects a move to anything other than the exact vault/local location strings", () => {
    const { trusted, service, handlers } = setup();

    expect(() => handlers.move(trusted, "vault", "first", "cloud")).toThrow("Invalid dashboard storage location");
    expect(() => handlers.move(trusted, "vault", "first", undefined)).toThrow("Invalid dashboard storage location");
    expect(service.moveDashboard).not.toHaveBeenCalled();

    handlers.move(trusted, "vault", "first", "local");
    expect(service.moveDashboard).toHaveBeenCalledWith("vault", "first", "local");
  });

  it("authenticates and bounds the selected bundle before returning its trusted handoff", () => {
    const { trusted, service, handlers } = setup();

    expect(handlers.agentHandoff(trusted, "vault", "first")).toBe("handoff:first");
    expect(service.dashboardAgentHandoff).toHaveBeenCalledWith("vault", "first");
    expect(() => handlers.agentHandoff(trusted, "vault", "x".repeat(65))).toThrow("Invalid dashboard ID");
    expect(service.dashboardAgentHandoff).toHaveBeenCalledTimes(1);
  });
});
