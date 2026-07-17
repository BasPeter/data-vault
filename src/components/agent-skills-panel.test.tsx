// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSkillProviderId, ClaudePluginExportResult, SkillStatus, VaultApi } from "@/types";
import { AgentSkillsPanel } from "./agent-skills-panel";

const currentStatus: SkillStatus = {
  state: "current",
  version: "9",
  vaultCount: 1,
  providers: [
    {
      id: "claude",
      label: "Claude",
      root: "~/.claude/skills",
      enabled: true,
      state: "current",
      skills: [
        { name: "vault-guide", label: "Vault Guide", latestVersion: "9", installedVersion: "9", state: "current" },
      ],
    },
    {
      id: "codex",
      label: "Codex",
      root: "~/.codex/skills",
      enabled: false,
      state: "needs-install",
      skills: [
        {
          name: "vault-guide",
          label: "Vault Guide",
          latestVersion: "9",
          installedVersion: null,
          state: "not-installed",
        },
      ],
    },
    {
      id: "opencode",
      label: "OpenCode",
      root: "~/.config/opencode/skills",
      enabled: false,
      state: "needs-install",
      skills: [
        {
          name: "vault-guide",
          label: "Vault Guide",
          latestVersion: "9",
          installedVersion: null,
          state: "not-installed",
        },
      ],
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

function api(exportClaudePlugin: () => Promise<ClaudePluginExportResult>): VaultApi {
  return {
    skillStatus: vi.fn(async () => currentStatus),
    skillProviderSelection: vi.fn(async () => ["claude"] as AgentSkillProviderId[]),
    saveSkillProviderSelection: vi.fn(async () => currentStatus),
    claudePluginStatus: vi.fn(async () => ({ state: "current", pluginFingerprint: "abc" })),
    exportClaudePlugin: vi.fn(exportClaudePlugin),
  } as unknown as VaultApi;
}

async function openPanel(): Promise<void> {
  await act(async () => {
    root.render(<AgentSkillsPanel vaults={[{ id: "v", name: "Vault", repositoryPath: "/vault", format: "html" }]} />);
  });
  const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Agent skills are up to date"),
  );
  await act(async () => trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const details = document.body.querySelector("details")!;
  await act(async () => details.setAttribute("open", ""));
}

function exportButton(): HTMLButtonElement {
  return Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Export Claude plugin"),
  )!;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("AgentSkillsPanel Claude plugin export", () => {
  it("shows a provider-specific install failure, its skill states, and the retry action", async () => {
    const failedStatus: SkillStatus = {
      ...currentStatus,
      state: "error",
      providers: currentStatus.providers.map((provider) =>
        provider.id === "codex"
          ? {
              ...provider,
              enabled: true,
              state: "error",
              error: "The global skills directory is not writable.",
              skills: [
                {
                  name: "vault-guide",
                  label: "Vault Guide",
                  latestVersion: "9",
                  installedVersion: null,
                  state: "not-installed",
                },
                {
                  name: "document-reviewer",
                  label: "Document Reviewer",
                  latestVersion: "9",
                  installedVersion: "8",
                  state: "outdated",
                },
              ],
            }
          : provider,
      ),
    };
    const nextApi = api(async () => ({ exported: false }));
    nextApi.skillStatus = vi.fn(async () => failedStatus);
    nextApi.skillProviderSelection = vi.fn(async () => ["claude", "codex"] as AgentSkillProviderId[]);
    window.vaultApi = nextApi;
    await act(async () => {
      root.render(<AgentSkillsPanel vaults={[{ id: "v", name: "Vault", repositoryPath: "/vault", format: "html" }]} />);
    });
    const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Agent skills need attention"),
    )!;
    await act(async () => trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.textContent).toContain(
      "Could not install Codex: The global skills directory is not writable. Select Re-install skills to retry.",
    );
    expect(document.body.textContent).toContain("Vault Guide: not installed");
    expect(document.body.textContent).toContain("Document Reviewer: outdated");
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Could not install Codex");
    expect(
      Array.from(document.body.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Re-install skills"),
      ),
    ).toBe(true);
  });

  it("saves an explicit provider selection and explains that opt-out is non-destructive", async () => {
    const nextApi = api(async () => ({ exported: false }));
    window.vaultApi = nextApi;
    await openPanel();
    const opencode = Array.from(document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find(
      (input) => input.parentElement?.textContent?.includes("OpenCode"),
    )!;
    expect(opencode.checked).toBe(false);
    expect(document.body.textContent).toContain("does not remove files already installed outside Data Vault");
    await act(async () => opencode.click());
    const save = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save providers"),
    )!;
    await act(async () => save.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(nextApi.saveSkillProviderSelection).toHaveBeenCalledWith(["claude", "opencode"]);
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain("Provider selection saved.");
  });

  it("invokes export, disables the action while pending, and reports success", async () => {
    let resolve!: (result: ClaudePluginExportResult) => void;
    const pending = new Promise<ClaudePluginExportResult>((done) => {
      resolve = done;
    });
    window.vaultApi = api(() => pending);
    await openPanel();
    const button = exportButton();
    await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(window.vaultApi.exportClaudePlugin).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Exporting...");
    await act(async () =>
      resolve({
        exported: true,
        filePath: "C:/safe/plugin.zip",
        pluginVersion: "1.0.0",
        fingerprint: "abcdef1234567890",
      }),
    );
    expect(document.body.textContent).toContain("Exported C:/safe/plugin.zip (abcdef123456).");
    expect(document.body.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it("shows a sanitized recoverable error including the safe backup path", async () => {
    window.vaultApi = api(async () => {
      throw new Error("Plugin replacement failed; the previous export is preserved at C:/safe/.plugin.zip.backup");
    });
    await openPanel();
    await act(async () => exportButton().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.textContent).toContain(
      "Plugin replacement failed; the previous export is preserved at C:/safe/.plugin.zip.backup",
    );
    expect(document.body.querySelector('[role="alert"][aria-live="assertive"]')).not.toBeNull();
  });

  it("is collapsed by default and copies a stale-only fixed prompt with success and error feedback", async () => {
    const prompt = "fixed safe prompt";
    const nextApi = api(async () => ({ exported: false }));
    nextApi.claudePluginStatus = vi.fn(async () => ({
      state: "stale" as const,
      pluginFingerprint: "old",
      updatePrompt: prompt,
    }));
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.vaultApi = nextApi;
    await act(async () => {
      root.render(<AgentSkillsPanel vaults={[{ id: "v", name: "Vault", repositoryPath: "/vault", format: "html" }]} />);
    });
    const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Agent skills are up to date"),
    )!;
    await act(async () => trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const details = document.body.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Claude Desktop and Cowork plugin");
    await act(async () => details.setAttribute("open", ""));
    const copy = Array.from(details.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy Cowork update prompt"),
    )!;
    await act(async () => copy.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(writeText).toHaveBeenCalledWith(prompt);
    expect(details.textContent).toContain("Cowork update prompt copied.");
    expect(details.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();

    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => copy.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(details.textContent).toContain("Could not copy the Cowork update prompt.");
    expect(details.querySelector('[role="alert"][aria-live="assertive"]')).not.toBeNull();
  });

  it("explains when a stale plugin cannot offer the Cowork update action", async () => {
    const nextApi = api(async () => ({ exported: false }));
    nextApi.claudePluginStatus = vi.fn(async () => ({
      state: "stale" as const,
      pluginFingerprint: "old",
      updateUnavailableReason: "Claude standalone skill sources are unavailable.",
    }));
    window.vaultApi = nextApi;
    await openPanel();
    expect(document.body.textContent).toContain(
      "Cowork update action is unavailable: Claude standalone skill sources are unavailable.",
    );
    expect(
      Array.from(document.body.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Copy Cowork update prompt"),
      ),
    ).toBe(false);
  });

  it("refreshes freshness status for format, language, and nested structure-only changes", async () => {
    const nextApi = api(async () => ({ exported: false }));
    window.vaultApi = nextApi;
    const base = { id: "v", name: "Vault", repositoryPath: "/vault", format: "html" as const };
    await act(async () => root.render(<AgentSkillsPanel vaults={[base]} />));
    expect(nextApi.claudePluginStatus).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<AgentSkillsPanel vaults={[{ ...base, format: "markdown" }]} />));
    await act(async () => root.render(<AgentSkillsPanel vaults={[{ ...base, defaultLanguage: "nl" }]} />));
    await act(async () =>
      root.render(
        <AgentSkillsPanel
          vaults={[
            {
              ...base,
              structure: {
                notes: { title: "Notes", children: { alpha: { title: "Alpha" }, beta: { title: "Beta" } } },
              },
            },
          ]}
        />,
      ),
    );
    expect(nextApi.claudePluginStatus).toHaveBeenCalledTimes(4);
    await act(async () =>
      root.render(
        <AgentSkillsPanel
          vaults={[
            {
              ...base,
              structure: {
                notes: { title: "Notes", children: { beta: { title: "Beta" }, alpha: { title: "Alpha" } } },
              },
            },
          ]}
        />,
      ),
    );
    expect(nextApi.claudePluginStatus).toHaveBeenCalledTimes(5);
  });

  it("reports export success and its non-fatal freshness warning together", async () => {
    window.vaultApi = api(async () => ({
      exported: true,
      filePath: "C:/safe/plugin.zip",
      pluginVersion: "1.0.0",
      fingerprint: "a".repeat(64),
      warning: "Plugin exported, but freshness tracking could not be saved.",
    }));
    await openPanel();
    await act(async () => exportButton().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.body.textContent).toContain(
      "Exported C:/safe/plugin.zip (aaaaaaaaaaaa). Plugin exported, but freshness tracking could not be saved.",
    );
  });
});
