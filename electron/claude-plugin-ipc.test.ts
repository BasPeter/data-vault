import { describe, expect, it, vi } from "vitest";
import type { ClaudePluginIpcDependencies } from "./claude-plugin-ipc";
import { CLAUDE_PLUGIN_SAVE_DIALOG, createClaudePluginExportHandler } from "./claude-plugin-ipc";

function dependencies(overrides: Partial<ClaudePluginIpcDependencies> = {}): ClaudePluginIpcDependencies {
  return {
    assertTrusted: vi.fn(),
    windowFromSender: vi.fn(() => ({})),
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: "plugin.zip" })),
    pathExists: vi.fn(() => false),
    confirmReplace: vi.fn(async () => true),
    listVaults: vi.fn(() => []),
    exportPlugin: vi.fn(() => ({ exported: true, filePath: "plugin.zip", pluginVersion: "1.0.0", fingerprint: "abc" })),
    recordExport: vi.fn(),
    ...overrides,
  };
}

describe("Claude plugin IPC handler", () => {
  it("asserts sender trust before resolving the application window", async () => {
    const trustedError = new Error("untrusted sender");
    const deps = dependencies({
      assertTrusted: vi.fn(() => {
        throw trustedError;
      }),
    });
    await expect(createClaudePluginExportHandler(deps)({ sender: "renderer" })).rejects.toBe(trustedError);
    expect(deps.windowFromSender).not.toHaveBeenCalled();
  });

  it("requires a BrowserWindow-equivalent lookup result", async () => {
    const deps = dependencies({ windowFromSender: vi.fn(() => null) });
    await expect(createClaudePluginExportHandler(deps)({ sender: "renderer" })).rejects.toThrow(
      /No application window/,
    );
    expect(deps.showSaveDialog).not.toHaveBeenCalled();
  });

  it("returns cancellation without invoking the exporter", async () => {
    const deps = dependencies({ showSaveDialog: vi.fn(async () => ({ canceled: true })) });
    await expect(createClaudePluginExportHandler(deps)({ sender: "renderer" })).resolves.toEqual({ exported: false });
    expect(deps.exportPlugin).not.toHaveBeenCalled();
  });

  it("confirms an exact normalized collision and exports trusted vault data", async () => {
    const vaults = [{ id: "v", name: "Vault", repositoryPath: "/vault", format: "html" as const }];
    const deps = dependencies({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: "plugin" })),
      pathExists: vi.fn((filePath) => filePath === "plugin.zip"),
      listVaults: vi.fn(() => vaults),
    });
    await createClaudePluginExportHandler(deps)({ sender: "renderer" });
    expect(deps.confirmReplace).toHaveBeenCalledWith(expect.anything(), "plugin.zip");
    expect(deps.exportPlugin).toHaveBeenCalledWith("plugin.zip", vaults, true);
    expect(deps.recordExport).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: "abc" }), vaults);
  });

  it("sanitizes exporter failures at the IPC boundary", async () => {
    const deps = dependencies({
      exportPlugin: vi.fn(() => {
        throw new Error("secret internal detail");
      }),
    });
    await expect(createClaudePluginExportHandler(deps)({ sender: "renderer" })).rejects.toThrow(
      "Claude plugin export failed. Choose another destination and try again.",
    );
  });

  it("returns archive success with a warning when freshness recording fails", async () => {
    const deps = dependencies({
      recordExport: vi.fn(() => {
        throw new Error("state disk failure");
      }),
    });
    await expect(createClaudePluginExportHandler(deps)({ sender: "renderer" })).resolves.toMatchObject({
      exported: true,
      filePath: "plugin.zip",
      warning: "Plugin exported, but freshness tracking could not be saved.",
    });
  });

  it("defines the native save dialog contract", () => {
    expect(CLAUDE_PLUGIN_SAVE_DIALOG).toEqual({
      title: "Export Claude plugin",
      defaultPath: "data-vault-claude-plugin.zip",
      filters: [{ name: "ZIP archive", extensions: ["zip"] }],
    });
  });
});
