// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultApi } from "@/types";
import App from "./App";

vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: ({ onSelectDashboard }: { onSelectDashboard: (id: string) => void }) => (
    <button onClick={() => onSelectDashboard("focus")}>Open dashboard</button>
  ),
}));
vi.mock("@/components/dashboard-create-dialog", () => ({ DashboardCreateDialog: () => null }));
vi.mock("@/components/dashboard-host", () => ({ DashboardHost: () => <div>Dashboard view</div> }));
vi.mock("@/components/dashboard-permission-dialog", () => ({ DashboardPermissionDialog: () => null }));
vi.mock("@/components/dashboard-secrets-dialog", () => ({ DashboardSecretsDialog: () => null }));
vi.mock("@/components/document-picker", () => ({ DocumentPicker: () => <div>Document picker</div> }));
vi.mock("@/components/document-tabs", () => ({ DocumentTabs: () => <div>Document tabs</div> }));
vi.mock("@/components/document-view", () => ({ DocumentView: () => <div>Document view</div> }));
vi.mock("@/components/graph-view", () => ({ GraphView: () => <div>Graph view</div> }));
vi.mock("@/components/guided-tour", () => ({ GuidedTour: () => null }));
vi.mock("@/components/quick-notes-panel", () => ({ QuickNotesPanel: () => null }));
vi.mock("@/components/tag-cloud", () => ({ TagCloud: () => <div>Tag cloud view</div> }));
vi.mock("@/components/vault-switcher", () => ({ VaultSwitcher: () => <div>Vault switcher</div> }));
vi.mock("@/components/vault-changes-indicator", () => ({ VaultChangesIndicator: () => null }));
vi.mock("@/components/vault-init-dialog", () => ({ VaultInitDialog: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/update-button", () => ({ UpdateButton: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
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
  window.vaultApi = {
    platform: "win32",
    list: vi.fn(async () => [{ id: "vault", name: "Vault", repositoryPath: "", format: "html" }]),
    watch: vi.fn(async () => undefined),
    manifest: vi.fn(async () => ({ tree: [{ type: "doc", id: "document", label: "Document", date: null, tags: [] }] })),
    dashboards: vi.fn(async () => [
      {
        location: "vault",
        schemaVersion: 1,
        id: "focus",
        title: "Focus",
        icon: "target",
        color: "green",
        kind: "blank",
        entrypoint: "index.html",
        requestedCapabilities: [],
      },
    ]),
    onVaultChanged: vi.fn(() => vi.fn()),
    pendingOpenDocument: vi.fn(async () => null),
    onOpenDocument: vi.fn(() => vi.fn()),
    setTitleBarTheme: vi.fn(async () => undefined),
  } as unknown as VaultApi;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("app view transitions", () => {
  it("switches graph, dashboard, document, and tag-cloud views and toggles the active cloud back to documents", async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const click = async (selector: string) => {
      await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
    };

    await click('button[title="Graph"]');
    expect(container.textContent).toContain("Graph view");
    await click('button[aria-label="Tag cloud"]');
    expect(container.textContent).toContain("Tag cloud view");
    expect(container.querySelector('button[aria-label="Tag cloud"]')?.getAttribute("aria-pressed")).toBe("true");
    await click('button[aria-label="Tag cloud"]');
    expect(container.textContent).toContain("Document view");

    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Open dashboard")!
        .click(),
    );
    expect(container.textContent).toContain("Dashboard view");
    await click('button[aria-label="Tag cloud"]');
    expect(container.textContent).toContain("Tag cloud view");
    await click('button[aria-label="Tag cloud"]');
    expect(container.textContent).toContain("Document view");
  });
});
