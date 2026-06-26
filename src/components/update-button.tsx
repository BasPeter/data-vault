import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Check, Clipboard, Download, FileText, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppChangelog, AppChangelogRelease, UpdateStatus } from "@/types";

const initialStatus: UpdateStatus = { state: "idle", currentVersion: "" };

// States that mean a newer release than the installed one has been found.
const NEWER_STATES = ["available", "downloading", "downloaded", "installing"];
const BUSY_STATES = ["checking", "available", "downloading", "installing"];

function headline(status: UpdateStatus): string {
  switch (status.state) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Version ${status.version ?? "…"} found`;
    case "downloading":
      return `Downloading version ${status.version ?? "…"}…`;
    case "downloaded":
      return `Version ${status.version ?? ""} is ready to install`.trim();
    case "installing":
      return "Installing update";
    case "not-available":
      return "You're up to date";
    case "error":
      return "Update check failed";
    default:
      return "Check for updates";
  }
}

function detail(status: UpdateStatus): string {
  switch (status.state) {
    case "downloading":
      return `${Math.round(status.percent ?? 0)}% downloaded`;
    case "downloaded":
      return "Data Vault will restart to finish installing.";
    case "installing":
      return "Data Vault is closing to complete the update.";
    case "error":
      return status.message ?? "Unknown error.";
    case "available":
      return "Downloading in the background…";
    default:
      return `Installed version ${status.currentVersion || "unknown"}.`;
  }
}

function StatusIcon({ status }: { status: UpdateStatus }) {
  if (BUSY_STATES.includes(status.state)) return <RefreshCw className="animate-spin" />;
  if (status.state === "downloaded") return <RotateCcw />;
  if (status.state === "not-available") return <Check />;
  if (status.state === "error") return <TriangleAlert />;
  return <Download />;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function sanitizeReleaseNotes(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function ChangelogRelease({ release }: { release: AppChangelogRelease }) {
  return (
    <section className="border-b py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tabular-nums">Version {release.version}</h3>
        <p className="text-muted-foreground text-xs whitespace-nowrap">{formatDate(release.date)}</p>
      </div>
      {release.commits.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {release.commits.map((commit) => (
            <li key={commit.hash} className="grid grid-cols-[4.75rem_1fr] gap-2 text-xs leading-relaxed">
              <span className="text-muted-foreground font-mono tabular-nums">{commit.shortHash}</span>
              <span className="min-w-0 break-words">{commit.subject}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">No commits are bundled for this version.</p>
      )}
    </section>
  );
}

function UpdateFeedRelease({ status }: { status: UpdateStatus }) {
  if (!status.version || !status.latestReleaseNotes) return null;
  const releaseNotes = sanitizeReleaseNotes(status.latestReleaseNotes);
  return (
    <section className="border-b py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tabular-nums">Version {status.version}</h3>
        <p className="text-muted-foreground text-xs whitespace-nowrap">Update feed</p>
      </div>
      <div
        className="text-muted-foreground mt-2 text-xs leading-relaxed [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:font-mono [&_p]:my-2 [&_tt]:font-mono"
        dangerouslySetInnerHTML={{ __html: releaseNotes }}
      />
    </section>
  );
}

export function UpdateButton({ showLabel = false }: { showLabel?: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [open, setOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelog, setChangelog] = useState<AppChangelog | null>(null);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    const unsubscribe = window.vaultApi.onUpdateStatus(setStatus);
    window.vaultApi
      .updateStatus()
      .then(setStatus)
      .catch((cause) => setStatus({ state: "error", currentVersion: "", message: String(cause) }));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!changelogOpen || changelog) return;
    window.vaultApi
      .changelog()
      .then((nextChangelog) => {
        setChangelog(nextChangelog);
        setChangelogError(null);
      })
      .catch((cause) => setChangelogError(cause instanceof Error ? cause.message : String(cause)));
  }, [changelogOpen, changelog]);

  const newer = NEWER_STATES.includes(status.state);
  const busy = BUSY_STATES.includes(status.state);
  const ready = status.state === "downloaded" || status.state === "installing";
  const versionText = status.currentVersion ? `v${status.currentVersion}` : "Data Vault";
  const dotLabel = newer ? ` — update to version ${status.version ?? "available"}` : "";
  const promptVersion = status.version ?? changelog?.releases[0]?.version ?? status.currentVersion;
  const updateFeedHasSeparateRelease = Boolean(
    status.version &&
    status.latestReleaseNotes &&
    !changelog?.releases.some((release) => release.version === status.version?.replace(/^v/, "")),
  );

  const recheck = () => {
    window.vaultApi
      .checkForUpdates()
      .catch((cause) =>
        setStatus({ ...status, state: "error", message: cause instanceof Error ? cause.message : String(cause) }),
      );
  };
  const installAndRestart = () => {
    window.vaultApi
      .installUpdate()
      .catch((cause) =>
        setStatus({ ...status, state: "error", message: cause instanceof Error ? cause.message : String(cause) }),
      );
  };
  const showChangelog = () => {
    setOpen(false);
    setChangelogOpen(true);
  };
  const copySecurityPrompt = async () => {
    setCopyState("idle");
    try {
      const prompt = await window.vaultApi.securityAssessmentPrompt(promptVersion);
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative font-normal tabular-nums"
            title={`Data Vault ${versionText}${dotLabel}`}
            aria-label={`Data Vault ${versionText}${dotLabel}`}
          >
            {showLabel ? `Data Vault ${versionText}` : versionText}
            {newer && (
              <span
                aria-hidden
                className="bg-destructive absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="flex items-start gap-3">
            <span className="text-muted-foreground mt-0.5 [&_svg]:size-4">
              <StatusIcon status={status} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{headline(status)}</p>
              <p className="text-muted-foreground mt-0.5 text-xs break-words">{detail(status)}</p>
            </div>
          </div>

          {status.state === "downloading" && (
            <div className="bg-muted mt-3 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.round(status.percent ?? 0)}%` }}
              />
            </div>
          )}

          <div className="mt-4 grid gap-2">
            <Button size="sm" variant="outline" onClick={showChangelog}>
              <FileText />
              Show changelog
            </Button>
            {ready ? (
              <Button size="sm" onClick={installAndRestart} disabled={status.state === "installing"}>
                {status.state === "installing" ? <RefreshCw className="animate-spin" /> : <RotateCcw />}
                {status.state === "installing" ? "Installing…" : "Update and restart"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={recheck} disabled={busy}>
                <RefreshCw className={busy ? "animate-spin" : ""} />
                {busy ? "Checking…" : "Check for updates"}
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DialogContent className="max-w-2xl gap-0 p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Data Vault changelog</DialogTitle>
            <DialogDescription>Versions and bundled commits generated from the release tags.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
            <p className="text-muted-foreground text-xs">
              Security review target: <span className="font-medium tabular-nums">v{promptVersion || "latest"}</span>
            </p>
            <Button size="sm" variant="outline" onClick={copySecurityPrompt}>
              <Clipboard />
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy AI prompt"}
            </Button>
          </div>

          <ScrollArea className="max-h-[60vh] px-6">
            {changelogError ? (
              <div className="text-muted-foreground py-6 text-sm">{changelogError}</div>
            ) : changelog ? (
              <>
                {updateFeedHasSeparateRelease && <UpdateFeedRelease status={status} />}
                {changelog.releases.map((release) => (
                  <ChangelogRelease key={release.version} release={release} />
                ))}
              </>
            ) : (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <RefreshCw className="size-4 animate-spin" />
                Loading changelog…
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
