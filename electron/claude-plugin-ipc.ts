import type { ClaudePluginExportResult, VaultSummary } from "../src/types";
import { CLAUDE_PLUGIN_FILE, resolveClaudePluginDestination, sanitizedClaudePluginError } from "./claude-plugin";

type Event = { sender: unknown };
type Window = object;

export type ClaudePluginIpcDependencies = {
  assertTrusted(event: Event): void;
  windowFromSender(sender: unknown): Window | null;
  showSaveDialog(window: Window): Promise<{ canceled: boolean; filePath?: string }>;
  pathExists(filePath: string): boolean;
  confirmReplace(window: Window, filePath: string): Promise<boolean>;
  listVaults(): VaultSummary[];
  exportPlugin(filePath: string, vaults: VaultSummary[], overwriteConfirmed: boolean): ClaudePluginExportResult;
  recordExport(result: ClaudePluginExportResult, vaults: VaultSummary[]): void;
};

export const CLAUDE_PLUGIN_SAVE_DIALOG = {
  title: "Export Claude plugin",
  defaultPath: CLAUDE_PLUGIN_FILE,
  filters: [{ name: "ZIP archive", extensions: ["zip"] }],
};

export function createClaudePluginExportHandler(dependencies: ClaudePluginIpcDependencies) {
  return async (event: Event): Promise<ClaudePluginExportResult> => {
    dependencies.assertTrusted(event);
    const window = dependencies.windowFromSender(event.sender);
    if (!window) throw new Error("No application window available.");
    const selection = await dependencies.showSaveDialog(window);
    const destination = await resolveClaudePluginDestination(selection, dependencies.pathExists, (filePath) =>
      dependencies.confirmReplace(window, filePath),
    );
    if (!destination) return { exported: false };
    try {
      const vaults = dependencies.listVaults();
      const result = dependencies.exportPlugin(destination, vaults, true);
      try {
        dependencies.recordExport(result, vaults);
      } catch {
        if (result.exported) {
          return { ...result, warning: "Plugin exported, but freshness tracking could not be saved." };
        }
      }
      return result;
    } catch (error) {
      throw sanitizedClaudePluginError(error);
    }
  };
}
