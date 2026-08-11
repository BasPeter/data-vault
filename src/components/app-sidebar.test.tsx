// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode, VaultApi } from "@/types";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("@/components/agent-skills-panel", () => ({ AgentSkillsPanel: () => null }));
vi.mock("@/components/update-button", () => ({ UpdateButton: () => null }));

const tree: TreeNode[] = [
  { type: "doc", id: "welcome", label: "Welcome", date: null, tags: [] },
  { type: "doc", id: "overview", label: "Overview", date: null, tags: [] },
];

let container: HTMLDivElement;
let root: Root;

function renderSidebar({
  activeId = "welcome",
  onSelect = vi.fn(),
  sidebarOpen = true,
  sidebarTree = tree,
}: {
  activeId?: string;
  onSelect?: (id: string) => void;
  sidebarOpen?: boolean;
  sidebarTree?: TreeNode[];
} = {}): void {
  root.render(
    <SidebarProvider key={String(sidebarOpen)} defaultOpen={sidebarOpen}>
      <AppSidebar
        tree={sidebarTree}
        activeId={activeId}
        onSelect={onSelect}
        onCopyPath={vi.fn()}
        vaultName="Example Vault"
        vaults={[]}
        dashboards={[]}
        activeDashboardId={null}
        onSelectDashboard={vi.fn()}
        onCreateDashboard={vi.fn()}
        onRenameDashboard={vi.fn()}
        onMoveDashboard={vi.fn()}
        onRemoveDashboard={vi.fn()}
        onRelocateDashboard={vi.fn()}
        onManageSecrets={vi.fn()}
      />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.vaultApi = { platform: "win32" } as VaultApi;
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

describe("AppSidebar document selection", () => {
  it("identifies only the initially active document with a persistent visual and semantic state", async () => {
    await act(async () => renderSidebar());

    const currentEntries = container.querySelectorAll('[data-document-active="true"]');
    expect(currentEntries).toHaveLength(1);
    expect(currentEntries[0].textContent).toContain("Welcome");
    expect(currentEntries[0].getAttribute("aria-current")).toBe("page");
    expect(currentEntries[0].className).toContain("border-l-2");
    expect(currentEntries[0].className).toContain("border-sidebar-primary");
    expect(container.querySelector('button[aria-current="page"]')).toBe(currentEntries[0]);
    expect(
      [...container.querySelectorAll("button")]
        .find((entry) => entry.textContent?.includes("Overview"))
        ?.getAttribute("aria-current"),
    ).toBeNull();
  });

  it("moves the visual and semantic current state when the active document changes", async () => {
    await act(async () => renderSidebar());
    await act(async () => renderSidebar({ activeId: "overview" }));

    const currentEntries = container.querySelectorAll('[data-document-active="true"]');
    expect(currentEntries).toHaveLength(1);
    expect(currentEntries[0].textContent).toContain("Overview");
    expect(currentEntries[0].getAttribute("aria-current")).toBe("page");
    expect([...container.querySelectorAll('button[aria-current="page"]')]).toEqual([...currentEntries]);
    expect(
      [...container.querySelectorAll("button")]
        .find((entry) => entry.textContent?.includes("Welcome"))
        ?.getAttribute("aria-current"),
    ).toBeNull();
  });
});

describe("AppSidebar tag search", () => {
  const taggedTree: TreeNode[] = [
    {
      type: "folder",
      id: "workspace",
      label: "Workspace",
      children: [
        { type: "doc", id: "full", label: "Full match", date: null, tags: ["Azure", "Security", "Platform"] },
        { type: "doc", id: "two", label: "Two matches", date: null, tags: ["azure", "security"] },
        { type: "doc", id: "azure-one", label: "Azure first", date: null, tags: ["azure"] },
        { type: "doc", id: "azure-two", label: "Azure second", date: null, tags: ["azure"] },
        { type: "doc", id: "security", label: "Security only", date: null, tags: ["security"] },
        {
          type: "doc",
          id: "markup",
          label: "<b>Markup</b>",
          date: null,
          tags: ["<script>unsafe</script>"],
        },
        { type: "doc", id: "title-only", label: "Azure title only", date: null, tags: ["notes"] },
      ],
    },
  ];

  async function searchFor(query: string): Promise<void> {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]');
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function key(key: string): Promise<KeyboardEvent> {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')!;
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(event));
    return event;
  }

  async function paste(text: string, selectionStart?: number, selectionEnd?: number): Promise<void> {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')!;
    if (selectionStart !== undefined) input.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    await act(async () => input.dispatchEvent(event));
  }

  function resultLabels(): string[] {
    return [...container.querySelectorAll<HTMLElement>('[data-search-result="true"]')].map(
      (result) => result.textContent ?? "",
    );
  }

  it("uses a full-width search row above compact wrapping committed chips", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')!;
    expect(input.placeholder).toBe("Search");
    expect(input.className).toContain("w-full");
    expect(input.parentElement?.className).toContain("relative");

    await searchFor("azure");
    await key("Enter");

    const chipRow = container.querySelector<HTMLElement>("[data-tag-chip-row]");
    expect(chipRow?.previousElementSibling).toBe(input.parentElement);
    expect(chipRow?.className).toContain("flex-wrap");
    expect(chipRow?.className).toContain("gap-1");
    expect(chipRow?.textContent).toContain("azure");
  });

  it("commits comma, Enter, and pasted tokens while preserving spaces and supporting removal", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("automation platform");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')?.value).toBe(
      "automation platform",
    );
    await key("Enter");
    expect(container.querySelector('[aria-label="Remove automation platform"]')).not.toBeNull();

    await searchFor("azure");
    await key(",");
    await searchFor("security");
    await key("Enter");
    await searchFor("AZURE");
    await key("Enter");
    expect(container.querySelectorAll('[aria-label="Remove azure"]').length).toBe(1);
    expect(container.querySelector('[aria-label="Remove security"]')).not.toBeNull();

    await paste("<script>unsafe</script>, azure,");
    expect(container.querySelector('[aria-label="Remove <script>unsafe</script>"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove security"]')!.click());
    await key("Backspace");
    expect(container.querySelector('[aria-label="Remove <script>unsafe</script>"]')).toBeNull();
  });

  it("tokenizes the prospective paste value at the current selection without losing surrounding text", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("proj");
    await paste("ect, security", 4, 4);
    expect(container.querySelector('[aria-label="Remove project"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')?.value).toBe(
      "security",
    );

    await act(async () => renderSidebar({ sidebarTree: taggedTree }));
    await searchFor("seXity,");
    await paste("cur", 2, 3);
    expect(container.querySelector('[aria-label="Remove security"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')?.value).toBe("");
  });

  it("offers accessible manifest-tag suggestions with pointer and keyboard selection", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("azu");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(container.querySelector('[role="option"]')?.textContent).toContain("Azure");
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')!;
    const options = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.every((option) => option.tabIndex === -1)).toBe(true);
    const tabStops = [...container.querySelectorAll<HTMLElement>("input, button, [tabindex]")].filter(
      (element) => element.tabIndex >= 0 && !element.hasAttribute("disabled"),
    );
    expect(tabStops[tabStops.indexOf(input) + 1]?.getAttribute("aria-label")).toBe("Create dashboard");
    input.focus();
    expect((await key("Tab")).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    await key("ArrowDown");
    await key("Enter");
    expect(container.querySelector('[aria-label="Remove Azure"]')).not.toBeNull();

    await searchFor("azure");
    expect(container.querySelector('[role="option"]')).toBeNull();
    await searchFor("se");
    await searchFor("sec");
    await key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await searchFor("se");
    await searchFor("sec");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    expect(container.querySelector('[aria-label="Remove Security"]')).not.toBeNull();

    await searchFor("pla");
    await key("ArrowDown");
    expect((await key("Tab")).defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="Remove Platform"]')).not.toBeNull();
  });

  it("clears a highlighted suggestion when an updated manifest removes that option", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("a");
    await key("ArrowDown");
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search document tags"]')!;
    expect(input.getAttribute("aria-activedescendant")).not.toBeNull();

    await act(async () =>
      renderSidebar({ sidebarTree: [{ type: "doc", id: "other", label: "Other", date: null, tags: ["security"] }] }),
    );
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("ranks distinct query-token matches and keeps manifest-order ties", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("azure");
    await key("Enter");
    await searchFor("security");
    await key("Enter");
    await searchFor("platform");

    expect(container.textContent).not.toContain("Matching all tags");
    expect(container.textContent).not.toContain("Matching some tags");
    expect(container.textContent).not.toContain("Matching documents");
    expect(container.querySelector('[aria-label="Ranked document results"]')).not.toBeNull();
    expect(resultLabels()).toEqual([
      expect.stringContaining("Full match"),
      expect.stringContaining("Two matches"),
      expect.stringContaining("Azure first"),
      expect.stringContaining("Azure second"),
      expect.stringContaining("Security only"),
    ]);
    expect(resultLabels()[0]).toContain("Azure");
    expect(container.textContent).not.toContain("Azure title only");
    expect(container.textContent).toContain("3/3");
    expect(container.textContent).toContain("2/3");
    const rankedRow = container.querySelector<HTMLElement>('[data-search-result="true"]')!;
    expect(rankedRow.className).toContain("h-auto");
    expect(rankedRow.className).toContain("min-h-12");
    expect(rankedRow.className).toContain("items-start");
    expect(rankedRow.className).toContain("py-2");
    expect(rankedRow.querySelector("div")?.className).toContain("min-w-0");
    expect(rankedRow.querySelector("div")?.className).toContain("flex-1");
  });

  it("shows one group for one token and restores the hierarchy after every token is cleared", async () => {
    await act(async () => renderSidebar({ sidebarTree: taggedTree }));

    await searchFor("azure");
    await key("Enter");
    expect(container.textContent).not.toContain("Matching documents");
    expect(container.querySelector('[aria-label="Ranked document results"]')).not.toBeNull();
    await key("Backspace");
    expect(container.textContent).toContain("Workspace");
    expect(container.querySelector('[data-search-result="true"]')).toBeNull();
  });

  it("renders result context as text and preserves selection, active state, no-results, and collapsed behavior", async () => {
    const onSelect = vi.fn();
    await act(async () => renderSidebar({ activeId: "full", onSelect, sidebarTree: taggedTree }));

    await searchFor("azure");
    const full = container.querySelector<HTMLElement>('[data-search-result="true"]');
    expect(full?.textContent).toContain("Workspace");
    expect(full?.getAttribute("aria-current")).toBe("page");
    expect(full?.getAttribute("data-document-active")).toBe("true");
    await act(async () => full!.click());
    expect(onSelect).toHaveBeenCalledWith("full");

    await searchFor("no-match");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("No documents match");

    await searchFor("unsafe");
    expect(container.textContent).toContain("<b>Markup</b>");
    expect(container.innerHTML).not.toContain("<b>Markup</b>");

    await act(async () => renderSidebar({ sidebarOpen: false, sidebarTree: taggedTree }));
    expect(container.querySelector('input[aria-label="Search document tags"]')).toBeNull();
    expect(container.querySelector('[data-search-result="true"]')).toBeNull();
  });
});
