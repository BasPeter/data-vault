import { app, BrowserWindow } from "electron";
import updater from "electron-updater";
import { APP_CHANGELOG } from "./app-changelog.generated";
import type { AppChangelog, AppChangelogRelease, UpdateStatus } from "../src/types";

const { autoUpdater } = updater;

// Re-check GitHub Releases on this cadence so a freshly published version
// surfaces without the user reopening the application.
const AUTOMATIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let status: UpdateStatus = { state: "idle", currentVersion: app.getVersion() };
let installStarted = false;

function publish(next: UpdateStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("app:update-status", status);
}

function releaseNotesText(info: { releaseNotes?: unknown }): string | undefined {
  const notes = info.releaseNotes;
  if (typeof notes === "string") return notes;
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "note" in entry && typeof entry.note === "string") return entry.note;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return undefined;
}

export function configureUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => publish({ state: "checking", currentVersion: app.getVersion() }));
  autoUpdater.on("update-available", (info) =>
    publish({
      state: "available",
      currentVersion: app.getVersion(),
      version: info.version,
      latestReleaseNotes: releaseNotesText(info),
    }),
  );
  autoUpdater.on("update-not-available", () => publish({ state: "not-available", currentVersion: app.getVersion() }));
  autoUpdater.on("download-progress", (progress) =>
    publish({
      state: "downloading",
      currentVersion: app.getVersion(),
      version: status.version,
      percent: Math.max(0, Math.min(100, progress.percent)),
      latestReleaseNotes: status.latestReleaseNotes,
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    publish({
      state: "downloaded",
      currentVersion: app.getVersion(),
      version: info.version,
      latestReleaseNotes: releaseNotesText(info) ?? status.latestReleaseNotes,
    }),
  );
  autoUpdater.on("error", (error) =>
    publish({ state: "error", currentVersion: app.getVersion(), message: error.message }),
  );
  scheduleAutomaticChecks();
}

function scheduleAutomaticChecks(): void {
  // Update checks only function in an installed build; stay silent in development
  // so the renderer keeps its neutral "idle" state instead of surfacing an error.
  if (!app.isPackaged) return;
  void checkForUpdates();
  const timer = setInterval(() => void checkForUpdates(), AUTOMATIC_CHECK_INTERVAL_MS);
  timer.unref?.();
}

export function updateStatus(): UpdateStatus {
  return status;
}

export function changelog(): AppChangelog {
  return APP_CHANGELOG;
}

function releaseForVersion(version?: string): AppChangelogRelease | undefined {
  if (!version) return APP_CHANGELOG.releases[0];
  return APP_CHANGELOG.releases.find((release) => release.version === version.replace(/^v/, ""));
}

export function securityAssessmentPrompt(version?: string): string {
  const release = releaseForVersion(version);
  const targetVersion =
    release?.version ?? version?.replace(/^v/, "") ?? APP_CHANGELOG.releases[0]?.version ?? app.getVersion();
  const updateReleaseNotes = status.version === targetVersion ? status.latestReleaseNotes : undefined;
  const commits = release?.commits.length
    ? release.commits.map((commit) => `- ${commit.shortHash} ${commit.subject}`).join("\n")
    : "- No commit list is bundled for this version.";
  const repository = APP_CHANGELOG.repositoryUrl ? `\nRepository: ${APP_CHANGELOG.repositoryUrl}` : "";
  const releaseNotes = updateReleaseNotes ? `\n\nRelease notes from the update feed:\n${updateReleaseNotes}` : "";

  return `Please perform a security assessment before I install Data Vault ${targetVersion}.

Context:
- Installed version: ${app.getVersion()}
- Target version: ${targetVersion}${repository}

Review the changes below for security-sensitive regressions. Focus on Electron sandboxing, IPC validation, filesystem and Git access, path traversal, symlink handling, HTML sanitization, external URL handling, update/install behavior, credential exposure, and any change that could expose vault contents.

Commits in this version:
${commits}${releaseNotes}

Return:
1. Critical or high-risk findings that should block installation.
2. Medium-risk findings or hardening recommendations.
3. Specific files or commits that need manual review.
4. A final install recommendation.`;
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    publish({
      state: "error",
      currentVersion: app.getVersion(),
      message: "Update checks are available only in an installed build.",
    });
    return status;
  }
  if (["checking", "available", "downloading"].includes(status.state)) return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (cause) {
    publish({
      state: "error",
      currentVersion: app.getVersion(),
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
  return status;
}

export function installUpdate(): void {
  if (status.state !== "downloaded") throw new Error("No downloaded update is ready to install.");
  if (installStarted) return;
  installStarted = true;
  publish({
    state: "installing",
    currentVersion: app.getVersion(),
    version: status.version,
    latestReleaseNotes: status.latestReleaseNotes,
  });
  autoUpdater.quitAndInstall(true, true);
}
