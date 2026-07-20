// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardListEntry } from "@/dashboard-contracts";
import type { VaultApi } from "@/types";
import { SidebarProvider } from "./ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { DashboardCreateDialog } from "./dashboard-create-dialog";
import { DashboardHost } from "./dashboard-host";
import { DashboardPermissionDialog } from "./dashboard-permission-dialog";
import { DashboardSecretsDialog } from "./dashboard-secrets-dialog";

vi.mock("@/components/agent-skills-panel", () => ({ AgentSkillsPanel: () => null }));
vi.mock("@/components/update-button", () => ({ UpdateButton: () => null }));

const dashboard: DashboardListEntry = {
  location: "vault",
  schemaVersion: 1,
  id: "focus",
  title: "Focus",
  icon: "target",
  color: "green",
  kind: "vault-intelligence",
  entrypoint: "index.html",
  requestedCapabilities: ["vault:index:read", "vault:documents:read"],
};
const ideas: DashboardListEntry = {
  ...dashboard,
  id: "ideas",
  title: "Ideas",
  icon: "lightbulb",
  color: "purple",
  kind: "blank",
  requestedCapabilities: [],
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("dashboard trusted UI", () => {
  it("places accessible active dashboard launchers above Documents", async () => {
    window.vaultApi = { platform: "win32" } as VaultApi;
    await act(async () =>
      root.render(
        <SidebarProvider>
          <AppSidebar
            tree={[]}
            activeId={null}
            onSelect={vi.fn()}
            onCopyPath={vi.fn()}
            vaultName="Vault"
            vaults={[]}
            dashboards={[dashboard]}
            activeDashboardId="focus"
            onSelectDashboard={vi.fn()}
            onCreateDashboard={vi.fn()}
            onRenameDashboard={vi.fn()}
            onMoveDashboard={vi.fn()}
            onRemoveDashboard={vi.fn()}
            onRelocateDashboard={vi.fn()}
            onManageSecrets={vi.fn()}
          />
        </SidebarProvider>,
      ),
    );
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Dashboards")).toBeLessThan(text.indexOf("Documents"));
    const launcher = document.body.querySelector<HTMLButtonElement>('button[aria-label="Open Focus dashboard"]')!;
    expect(launcher.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.querySelector('button[aria-label="Create dashboard"]')).not.toBeNull();
  });

  it("keeps deterministic launcher order, truncates overflow, and activates by keyboard click", async () => {
    const select = vi.fn();
    const manyDashboards = [
      ideas,
      dashboard,
      ...Array.from({ length: 10 }, (_, index) => ({ ...dashboard, id: `extra-${index}`, title: `Extra ${index}` })),
    ];
    window.vaultApi = { platform: "win32" } as VaultApi;
    await act(async () =>
      root.render(
        <SidebarProvider>
          <AppSidebar
            tree={[]}
            activeId={null}
            onSelect={vi.fn()}
            onCopyPath={vi.fn()}
            vaultName="Vault"
            vaults={[]}
            dashboards={manyDashboards}
            activeDashboardId={null}
            onSelectDashboard={select}
            onCreateDashboard={vi.fn()}
            onRenameDashboard={vi.fn()}
            onMoveDashboard={vi.fn()}
            onRemoveDashboard={vi.fn()}
            onRelocateDashboard={vi.fn()}
            onManageSecrets={vi.fn()}
          />
        </SidebarProvider>,
      ),
    );

    const launchers = [...document.body.querySelectorAll<HTMLButtonElement>('button[aria-label^="Open "]')];
    expect(launchers.slice(0, 2).map((item) => item.getAttribute("aria-label"))).toEqual([
      "Open Ideas dashboard",
      "Open Focus dashboard",
    ]);
    const overflow = document.body.querySelector<HTMLElement>('[aria-label="Dashboard launchers"]')!;
    expect(overflow.tabIndex).toBe(0);
    expect(overflow.className).toContain("max-h-64");
    expect(overflow.className).toContain("overflow-y-auto");
    expect(document.body.textContent).toContain("Documents");
    expect(document.body.querySelector('button[aria-label="Create dashboard"]')).not.toBeNull();
    expect(launchers[0].querySelector(".truncate")?.className).toContain("truncate");
    launchers[1].focus();
    await act(async () => launchers[1].click());
    expect(document.activeElement).toBe(launchers[1]);
    expect(select).toHaveBeenCalledWith("focus");
  });

  it("offers trusted rename, reorder, and recoverable removal actions", async () => {
    const rename = vi.fn();
    const move = vi.fn();
    const remove = vi.fn();
    window.vaultApi = { platform: "win32" } as VaultApi;
    await act(async () =>
      root.render(
        <SidebarProvider>
          <AppSidebar
            tree={[]}
            activeId={null}
            onSelect={vi.fn()}
            onCopyPath={vi.fn()}
            vaultName="Vault"
            vaults={[]}
            dashboards={[dashboard, ideas]}
            activeDashboardId={null}
            onSelectDashboard={vi.fn()}
            onCreateDashboard={vi.fn()}
            onRenameDashboard={rename}
            onMoveDashboard={move}
            onRemoveDashboard={remove}
            onRelocateDashboard={vi.fn()}
            onManageSecrets={vi.fn()}
          />
        </SidebarProvider>,
      ),
    );
    const focus = document.body.querySelector<HTMLButtonElement>('button[aria-label="Open Focus dashboard"]')!;

    const choose = async (label: string) => {
      await act(async () =>
        focus.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 })),
      );
      const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
        candidate.textContent?.includes(label),
      );
      expect(item).toBeDefined();
      await act(async () => item!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    };

    await choose("Rename");
    await choose("Move later");
    await choose("Remove");
    expect(rename).toHaveBeenCalledWith(dashboard);
    expect(move).toHaveBeenCalledWith("focus", 1);
    expect(remove).toHaveBeenCalledWith(dashboard);
  });

  it("opens the dashboard actions menu from the overflow button on left click", async () => {
    const rename = vi.fn();
    const move = vi.fn();
    const remove = vi.fn();
    window.vaultApi = { platform: "win32" } as VaultApi;
    await act(async () =>
      root.render(
        <SidebarProvider>
          <AppSidebar
            tree={[]}
            activeId={null}
            onSelect={vi.fn()}
            onCopyPath={vi.fn()}
            vaultName="Vault"
            vaults={[]}
            dashboards={[dashboard, ideas]}
            activeDashboardId={null}
            onSelectDashboard={vi.fn()}
            onCreateDashboard={vi.fn()}
            onRenameDashboard={rename}
            onMoveDashboard={move}
            onRemoveDashboard={remove}
            onRelocateDashboard={vi.fn()}
            onManageSecrets={vi.fn()}
          />
        </SidebarProvider>,
      ),
    );
    const menuButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Focus dashboard menu"]')!;

    const choose = async (label: string) => {
      await act(async () => menuButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
      const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
        candidate.textContent?.includes(label),
      );
      expect(item).toBeDefined();
      await act(async () => item!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    };

    await choose("Rename");
    await choose("Move later");
    await choose("Remove");
    expect(rename).toHaveBeenCalledWith(dashboard);
    expect(move).toHaveBeenCalledWith("focus", 1);
    expect(remove).toHaveBeenCalledWith(dashboard);
  });

  it("creates a dashboard from the minimal purpose flow", async () => {
    const create = vi.fn(async () => undefined);
    await act(async () => root.render(<DashboardCreateDialog open onOpenChange={vi.fn()} onCreate={create} />));
    const input = document.body.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Weekly focus");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Weekly focus", inputType: "insertText" }));
    });
    const select = document.body.querySelector<HTMLSelectElement>('select[aria-label="Dashboard starting purpose"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "vault-intelligence");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const iconSelect = document.body.querySelector<HTMLSelectElement>('select[aria-label="Dashboard icon"]')!;
    const colorSelect = document.body.querySelector<HTMLSelectElement>('select[aria-label="Dashboard colour"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(iconSelect, "compass");
      iconSelect.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(colorSelect, "orange");
      colorSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const button = [...document.body.querySelectorAll("button")].find((item) => item.textContent === "Create")!;
    await act(async () => button.click());
    expect(create).toHaveBeenCalledWith({
      title: "Weekly focus",
      kind: "vault-intelligence",
      icon: "compass",
      color: "orange",
      // Sharing with the vault is the default; opting out has to be deliberate.
      location: "vault",
    });
  });

  it("creates an app-local dashboard when the user opts out of vault storage", async () => {
    const create = vi.fn(async () => undefined);
    await act(async () => root.render(<DashboardCreateDialog open onOpenChange={vi.fn()} onCreate={create} />));

    const input = document.body.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Private notes");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Private notes", inputType: "insertText" }));
    });
    const locationSelect = document.body.querySelector<HTMLSelectElement>(
      'select[aria-label="Dashboard storage location"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(locationSelect, "local");
      locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const button = [...document.body.querySelectorAll("button")].find((item) => item.textContent === "Create")!;
    await act(async () => button.click());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: "Private notes", location: "local" }));
  });

  it("shows current permission scope, grants selected documents, and supports revocation", async () => {
    const grant = vi.fn(async () => ({ schemaVersion: 1 as const, capabilities: [], selectedDocumentIds: [] }));
    const revoke = vi.fn(async () => undefined);
    window.vaultApi = {
      dashboardPermissionDetails: vi.fn(async () => ({
        requestedCapabilities: dashboard.requestedCapabilities,
        effectivePermissions: { schemaVersion: 1, capabilities: [], selectedDocumentIds: [] },
        documents: [{ id: "goal.html", title: "Goal" }],
      })),
      grantDashboardPermissions: grant,
      revokeDashboardPermissions: revoke,
    } as unknown as VaultApi;
    await act(async () =>
      root.render(<DashboardPermissionDialog open vaultId="vault" dashboard={dashboard} onOpenChange={vi.fn()} />),
    );
    await act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Dashboard code cannot open this dialog or approve itself.");
    const checkboxes = [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await act(async () => {
      checkboxes[1].click();
    });
    const documentCheckbox = [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].at(-1)!;
    await act(async () => documentCheckbox.click());
    const save = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Save access",
    )!;
    await act(async () => save.click());
    expect(grant).toHaveBeenCalledWith("vault", "focus", ["vault:documents:read"], ["goal.html"]);
    const revokeButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Revoke all",
    )!;
    await act(async () => revokeButton.click());
    expect(revoke).toHaveBeenCalledWith("vault", "focus");
  });

  it("cancels trusted permission management and contains repeated detail denials", async () => {
    const close = vi.fn();
    const details = vi.fn(async () => {
      throw new Error("Dashboard access denied.");
    });
    const grant = vi.fn();
    window.vaultApi = {
      dashboardPermissionDetails: details,
      grantDashboardPermissions: grant,
      revokeDashboardPermissions: vi.fn(),
    } as unknown as VaultApi;
    await act(async () =>
      root.render(<DashboardPermissionDialog open vaultId="vault" dashboard={dashboard} onOpenChange={close} />),
    );
    await act(async () => Promise.resolve());
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Dashboard access denied.");
    expect(grant).not.toHaveBeenCalled();

    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Cancel",
    )!;
    await act(async () => cancel.click());
    expect(close).toHaveBeenCalledWith(false);

    await act(async () =>
      root.render(
        <DashboardPermissionDialog open={false} vaultId="vault" dashboard={dashboard} onOpenChange={close} />,
      ),
    );
    await act(async () =>
      root.render(<DashboardPermissionDialog open vaultId="vault" dashboard={dashboard} onOpenChange={close} />),
    );
    await act(async () => Promise.resolve());
    expect(details).toHaveBeenCalledTimes(2);
    expect(grant).not.toHaveBeenCalled();
  });

  it("shows a recoverable host error, retries, and copies the trusted agent handoff", async () => {
    const openDashboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("Synthetic load failure"))
      .mockResolvedValue(undefined);
    const handoff = "Work only inside C:\\synthetic\\focus";
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.vaultApi = {
      openDashboard,
      setDashboardBounds: vi.fn(async () => undefined),
      setDashboardContentBounds: vi.fn(async () => undefined),
      stopDashboard: vi.fn(async () => undefined),
      dashboardRuntimeStatus: vi.fn(async () => null),
      dashboardAgentHandoff: vi.fn(async () => handoff),
    } as unknown as VaultApi;

    await act(async () =>
      root.render(<DashboardHost vaultId="vault" dashboard={dashboard} version={0} onManageAccess={vi.fn()} />),
    );
    await act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("Dashboard unavailable");
    expect(document.body.textContent).toContain("Synthetic load failure");

    const retry = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Retry",
    )!;
    await act(async () => retry.click());
    expect(openDashboard).toHaveBeenCalledTimes(2);

    const copy = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
      item.textContent?.includes("Copy agent handoff"),
    )!;
    await act(async () => copy.click());
    expect(window.vaultApi.dashboardAgentHandoff).toHaveBeenCalledWith("vault", "focus");
    expect(writeText).toHaveBeenCalledWith(handoff);
    expect(document.body.textContent).toContain("Copied");
  });
});

describe("dashboard secrets panel", () => {
  const overview = (available: boolean, set: boolean) => ({
    schemaVersion: 1 as const,
    available,
    secrets: [
      {
        name: "NOTION_TOKEN",
        set,
        origins: ["https://api.notion.com"],
        requiredBy: [{ dashboardId: "focus", title: "Focus" }],
      },
    ],
  });

  // There is no API that returns a stored value, and the panel must not imply
  // otherwise: the field stays empty and masked even for an already-set secret.
  it("never pre-fills or reveals a stored secret value", async () => {
    window.vaultApi = { dashboardSecrets: vi.fn(async () => overview(true, true)) } as unknown as VaultApi;
    await act(async () => root.render(<DashboardSecretsDialog open onOpenChange={vi.fn()} />));

    const input = document.body.querySelector<HTMLInputElement>('input[id="secret-NOTION_TOKEN"]')!;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
    expect(document.body.textContent).toContain("Set");
    expect(document.body.textContent).toContain("https://api.notion.com");
    expect(document.body.textContent).toContain("Focus");
  });

  it("saves a new value and clears the field afterwards", async () => {
    const setSecret = vi.fn(async () => overview(true, true));
    window.vaultApi = {
      dashboardSecrets: vi.fn(async () => overview(true, false)),
      setDashboardSecret: setSecret,
    } as unknown as VaultApi;
    await act(async () => root.render(<DashboardSecretsDialog open onOpenChange={vi.fn()} />));

    const input = document.body.querySelector<HTMLInputElement>('input[id="secret-NOTION_TOKEN"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "secret-value");
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "secret-value", inputType: "insertText" }));
    });
    const save = [...document.body.querySelectorAll("button")].find((item) => item.textContent === "Save")!;
    await act(async () => save.click());

    expect(setSecret).toHaveBeenCalledWith("NOTION_TOKEN", "secret-value");
    expect(document.body.querySelector<HTMLInputElement>('input[id="secret-NOTION_TOKEN"]')!.value).toBe("");
  });

  // Refusing to store a secret is the designed behaviour when the OS keychain is
  // missing, so the panel has to explain it rather than appear broken.
  it("explains and disables entry when the OS keychain is unavailable", async () => {
    window.vaultApi = { dashboardSecrets: vi.fn(async () => overview(false, false)) } as unknown as VaultApi;
    await act(async () => root.render(<DashboardSecretsDialog open onOpenChange={vi.fn()} />));

    expect(document.body.textContent).toContain("operating system keychain is unavailable");
    expect(document.body.querySelector<HTMLInputElement>('input[id="secret-NOTION_TOKEN"]')!.disabled).toBe(true);
  });
});
