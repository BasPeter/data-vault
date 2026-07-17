import { useCallback, useEffect, useState } from "react";
import { Check, Download, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentSkillProviderId, ClaudePluginStatus, SkillStatus, VaultSummary } from "@/types";
import { canonicalVaultSignature } from "./agent-skills-signature";

function headline(status: SkillStatus): string {
  switch (status.state) {
    case "current":
      return "Agent skills are up to date";
    case "needs-install":
      return "Agent skills need updating";
    case "error":
      return "Agent skills need attention";
    default:
      return "Set up agent skills";
  }
}

function detail(status: SkillStatus): string {
  switch (status.state) {
    case "current":
      return `Your selected providers can read, edit, and review your ${status.vaultCount} vault${status.vaultCount === 1 ? "" : "s"}.`;
    case "needs-install":
      return "Your vault list changed or a selected provider needs installation.";
    case "error":
      return "One or more selected providers could not install their skills. Try again to retry.";
    default:
      return "Choose where to install skills before Data Vault writes to a provider.";
  }
}

function actionLabel(status: SkillStatus, busy: boolean): string {
  if (busy) return "Installing...";
  switch (status.state) {
    case "not-configured":
      return "Install skills";
    case "needs-install":
      return "Update skills";
    default:
      return "Re-install skills";
  }
}

function installedVersionLabel(version: string | null): string {
  if (version === null) return "Not installed";
  if (version === "mixed") return "Mixed";
  return `v${version}`;
}

function SkillStatusIcon({
  status,
  statusError,
  busy,
}: {
  status: SkillStatus | null;
  statusError: boolean;
  busy: boolean;
}) {
  if (busy) return <RefreshCw className="animate-spin" />;
  if (statusError) return <TriangleAlert />;
  if (status?.state === "current") return <Check />;
  return <Sparkles />;
}

// Keep the healthy state compact; only spend sidebar space on setup, updates,
// or an error that needs the user's attention.
export function AgentSkillsPanel({ vaults }: { vaults: VaultSummary[] }) {
  const [status, setStatus] = useState<SkillStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [pluginStatus, setPluginStatus] = useState<ClaudePluginStatus | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<AgentSkillProviderId[]>([]);
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);

  const refreshPluginStatus = useCallback(() => {
    window.vaultApi
      .claudePluginStatus()
      .then(setPluginStatus)
      .catch(() => setPluginStatus(null));
  }, []);

  const refreshStatus = useCallback(() => {
    window.vaultApi
      .skillStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setStatusError(false);
      })
      .catch(() => setStatusError(true));
  }, []);

  const refreshSelection = useCallback(() => {
    window.vaultApi
      .skillProviderSelection()
      .then((providers) => {
        setSelection(providers);
        setSelectionLoaded(true);
      })
      .catch(() => {
        setSelectionLoaded(true);
        setSelectionMessage("Could not load provider selection. Try reopening this panel.");
      });
  }, []);

  // Re-check whenever the registered vaults change so the stale indicator
  // appears after a vault is added, removed, or renamed.
  const signature = canonicalVaultSignature(vaults);
  useEffect(() => {
    refreshStatus();
    refreshSelection();
    refreshPluginStatus();
    const refresh = () => {
      refreshStatus();
      refreshPluginStatus();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [signature, refreshPluginStatus, refreshSelection, refreshStatus]);

  const stale = statusError || (status !== null && status.state !== "current");

  const install = async () => {
    setBusy(true);
    try {
      setStatus(await window.vaultApi.installSkills());
      refreshPluginStatus();
      setStatusError(false);
    } catch {
      // Leave the previous status; the button stays available to retry.
    } finally {
      setBusy(false);
    }
  };

  const toggleProvider = (provider: AgentSkillProviderId) => {
    setSelection((selected) =>
      selected.includes(provider) ? selected.filter((candidate) => candidate !== provider) : [...selected, provider],
    );
  };

  const saveSelection = async () => {
    setSelectionBusy(true);
    setSelectionMessage(null);
    try {
      setStatus(await window.vaultApi.saveSkillProviderSelection(selection));
      setStatusError(false);
      setSelectionMessage("Provider selection saved.");
      refreshPluginStatus();
    } catch {
      setSelectionMessage("Could not save provider selection. Your previous selection is still active.");
    } finally {
      setSelectionBusy(false);
    }
  };

  const exportPlugin = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await window.vaultApi.exportClaudePlugin();
      if (result.exported) {
        setExportMessage(
          `Exported ${result.filePath} (${result.fingerprint.slice(0, 12)}).${result.warning ? ` ${result.warning}` : ""}`,
        );
        refreshPluginStatus();
      }
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "Export failed. Choose another destination and try again.",
      );
    } finally {
      setExporting(false);
    }
  };

  const copyUpdatePrompt = async () => {
    if (!pluginStatus?.updatePrompt) return;
    setCopyMessage(null);
    try {
      await navigator.clipboard.writeText(pluginStatus.updatePrompt);
      setCopyMessage("Cowork update prompt copied.");
    } catch {
      setCopyMessage("Could not copy the Cowork update prompt.");
    }
  };

  if (!status && !statusError) {
    return (
      <div className="text-muted-foreground flex h-9 items-center gap-2 px-2 text-xs">
        <RefreshCw className="size-4 animate-spin" />
        <span>Checking agent skills...</span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {status?.state === "current" && !statusError ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-9 w-full justify-start gap-2 px-2 text-xs font-normal"
            title="Agent skills are up to date"
          >
            <Check className="size-4" />
            <span>Agent skills are up to date</span>
          </Button>
        ) : (
          <button
            type="button"
            className="bg-sidebar-accent/40 hover:bg-sidebar-accent/60 w-full rounded-lg border p-3 text-left transition-colors"
            title={statusError ? "Could not check agent skills" : headline(status!)}
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground [&_svg]:size-4">
                {statusError ? <TriangleAlert /> : <Sparkles />}
              </span>
              <span className="text-sm font-medium">
                {statusError ? "Could not check agent skills" : headline(status!)}
              </span>
              {stale && <span aria-hidden className="bg-destructive ml-auto size-2 shrink-0 rounded-full" />}
            </div>
            <span className="text-muted-foreground mt-1.5 block text-xs leading-relaxed">
              {statusError
                ? "Try the check again. If the problem continues, the skills may not be writable."
                : detail(status!)}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">
            <SkillStatusIcon status={status} statusError={statusError} busy={busy} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {statusError ? "Could not check agent skills" : status ? headline(status) : "Checking agent skills..."}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              {statusError
                ? "Try the check again. If the problem continues, the skills may not be writable."
                : status
                  ? detail(status)
                  : "Reading installed Claude and Codex skill markers."}
            </p>
          </div>
        </div>

        <fieldset className="mt-4 border-t pt-4" disabled={!selectionLoaded || selectionBusy}>
          <legend className="text-sm font-medium">Install for</legend>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Select the providers that should receive future skill updates. Deselecting stops future writes and does not
            remove files already installed outside Data Vault.
          </p>
          <div className="mt-3 grid gap-2">
            {status?.providers.map((provider) => (
              <label key={provider.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selection.includes(provider.id)}
                  onChange={() => toggleProvider(provider.id)}
                />
                <span>
                  <span className="font-medium">{provider.label}</span>
                  <span className="text-muted-foreground block text-xs">{provider.root}</span>
                </span>
              </label>
            ))}
          </div>
          <Button
            className="mt-3 w-full"
            size="sm"
            onClick={saveSelection}
            disabled={!selectionLoaded || selectionBusy}
          >
            {selectionBusy && <RefreshCw className="animate-spin" />}
            {selectionBusy ? "Saving..." : "Save providers"}
          </Button>
          {selectionMessage && (
            <p
              className="text-muted-foreground mt-2 text-xs"
              role={selectionMessage.startsWith("Could not") ? "alert" : "status"}
              aria-live={selectionMessage.startsWith("Could not") ? "assertive" : "polite"}
            >
              {selectionMessage}
            </p>
          )}
        </fieldset>

        {status?.providers.filter((provider) => provider.enabled).length ? (
          <div className="mt-4 grid gap-2">
            {status.providers
              .filter((provider) => provider.enabled)
              .map((provider) => (
                <div key={provider.id} className="rounded-md border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{provider.label}</p>
                    <p className="text-muted-foreground capitalize">{provider.state.replace("-", " ")}</p>
                  </div>
                  {provider.error && (
                    <p className="mt-2" role="alert">
                      Could not install {provider.label}: {provider.error} Select Re-install skills to retry.
                    </p>
                  )}
                  {provider.skills.map((skill) => (
                    <p key={skill.name} className="text-muted-foreground mt-1 flex justify-between gap-2">
                      <span>
                        {skill.label}: {skill.state.replace("-", " ")}
                      </span>
                      <span>Installed: {installedVersionLabel(skill.installedVersion)}</span>
                    </p>
                  ))}
                </div>
              ))}
          </div>
        ) : null}

        {(statusError || status?.state !== "current") && (
          <div className="mt-4 grid gap-2">
            {statusError ? (
              <Button size="sm" variant="outline" onClick={refreshStatus}>
                <RefreshCw />
                Check again
              </Button>
            ) : (
              <Button size="sm" onClick={install} disabled={busy}>
                <RefreshCw className={busy ? "animate-spin" : ""} />
                {status ? actionLabel(status, busy) : "Install skills"}
              </Button>
            )}
          </div>
        )}
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">Claude Desktop and Cowork plugin</summary>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            Export a snapshot, then upload the ZIP in Claude Desktop under Customize &gt; Plugins. After changing
            vaults, remove the old plugin, export again, and upload the new snapshot.
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            This plugin is independent of your standalone Claude provider selection. Using both may show duplicate
            capabilities; Data Vault never removes either copy automatically.
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            The snapshot includes vault names, local repository paths, configured remote URLs, language, and structure
            metadata. It never includes vault documents or credentials.
          </p>
          <Button className="mt-3 w-full" size="sm" variant="outline" onClick={exportPlugin} disabled={exporting}>
            {exporting ? <RefreshCw className="animate-spin" /> : <Download />}
            {exporting ? "Exporting..." : "Export Claude plugin"}
          </Button>
          {exportMessage && (
            <p
              className="text-muted-foreground mt-2 break-words text-xs"
              role={exportMessage.startsWith("Exported") ? "status" : "alert"}
              aria-live={exportMessage.startsWith("Exported") ? "polite" : "assertive"}
            >
              {exportMessage}
            </p>
          )}
          {pluginStatus?.state === "not-exported" && (
            <p className="text-muted-foreground mt-2 text-xs">No Claude plugin export has been recorded yet.</p>
          )}
          {pluginStatus?.state === "current" && (
            <p className="text-muted-foreground mt-2 text-xs">
              The last exported plugin matches the current generated skills.
            </p>
          )}
          {pluginStatus?.state === "stale" && pluginStatus.updatePrompt && (
            <div className="mt-3 rounded-md border p-3">
              <p className="text-xs font-medium">Your exported plugin needs updating.</p>
              <Button className="mt-2 w-full" size="sm" variant="outline" onClick={copyUpdatePrompt}>
                Copy Cowork update prompt
              </Button>
              {copyMessage && (
                <p
                  className="text-muted-foreground mt-2 text-xs"
                  role={copyMessage.startsWith("Could not") ? "alert" : "status"}
                  aria-live={copyMessage.startsWith("Could not") ? "assertive" : "polite"}
                >
                  {copyMessage}
                </p>
              )}
            </div>
          )}
          {pluginStatus?.state === "stale" && pluginStatus.updateUnavailableReason && !pluginStatus.updatePrompt && (
            <p className="text-muted-foreground mt-2 text-xs" role="status" aria-live="polite">
              Cowork update action is unavailable: {pluginStatus.updateUnavailableReason}
            </p>
          )}
        </details>
      </PopoverContent>
    </Popover>
  );
}
