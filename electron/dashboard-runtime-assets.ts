import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const DASHBOARD_SCHEME = "vault-dashboard" as const;
export const DASHBOARD_SCHEME_PRIVILEGES = Object.freeze({ standard: true, secure: true });
export const DASHBOARD_ASSET_MAX_FILES = 256;
export const DASHBOARD_ASSET_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const DASHBOARD_ASSET_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const DASHBOARD_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; child-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MIME_TYPES = new Map<string, string>([
  [".html", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export type DashboardAsset = Readonly<{ bytes: Uint8Array; mimeType: string }>;
export type DashboardAssetSnapshot = Readonly<{
  assets: ReadonlyMap<string, DashboardAsset>;
  digest: string;
  fileCount: number;
  totalBytes: number;
}>;

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function snapshotError(message: string): never {
  throw new Error(`Invalid dashboard runtime assets: ${message}.`);
}

export function dashboardMimeType(file: string): string | null {
  return MIME_TYPES.get(path.extname(file).toLowerCase()) ?? null;
}

export function normalizeDashboardProtocolPath(rawPath: string): string | null {
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("?") || rawPath.includes("#")) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath.slice(1));
  } catch {
    return null;
  }
  // A remaining percent sign could be decoded a second time by another layer.
  // Reject it so path interpretation is provably single-pass.
  if (
    !decoded ||
    decoded.includes("%") ||
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    path.isAbsolute(decoded)
  ) {
    return null;
  }
  const segments = decoded.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

export function parseDashboardAssetUrl(url: string, runtimeId: string): string | null {
  const prefix = `${DASHBOARD_SCHEME}://${runtimeId}`;
  if (!url.startsWith(`${prefix}/`)) return null;
  return normalizeDashboardProtocolPath(url.slice(prefix.length));
}

export function createDashboardAssetSnapshot(bundleDirectory: string): DashboardAssetSnapshot {
  const bundleStats = fs.lstatSync(bundleDirectory);
  if (!bundleStats.isDirectory() || bundleStats.isSymbolicLink()) snapshotError("bundle is not a regular directory");
  const root = fs.realpathSync(bundleDirectory);
  const entries: Array<{ relative: string; canonical: string }> = [];

  const visit = (directory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) snapshotError("symbolic links are not supported");
      if (entry.isDirectory()) {
        const canonical = fs.realpathSync(absolute);
        if (!isWithin(root, canonical)) snapshotError("directory escapes its bundle");
        visit(canonical);
        continue;
      }
      if (!entry.isFile()) snapshotError("unsupported filesystem entry");
      const canonical = fs.realpathSync(absolute);
      if (!isWithin(root, canonical)) snapshotError("file escapes its bundle");
      const relative = path.relative(root, canonical).split(path.sep).join("/");
      // State is available only through the fixed dashboard API, never the asset protocol.
      if (relative === "state.json") continue;
      if (!dashboardMimeType(relative)) snapshotError("unsupported MIME type");
      entries.push({ relative, canonical });
      if (entries.length > DASHBOARD_ASSET_MAX_FILES) snapshotError("file-count limit exceeded");
    }
  };
  visit(root);

  const assets = new Map<string, DashboardAsset>();
  const digest = createHash("sha256");
  let totalBytes = 0;
  for (const entry of entries) {
    const before = fs.statSync(entry.canonical);
    if (!before.isFile() || before.size > DASHBOARD_ASSET_MAX_FILE_BYTES) snapshotError("per-file size limit exceeded");
    const bytes = fs.readFileSync(entry.canonical);
    const after = fs.statSync(entry.canonical);
    if (bytes.byteLength !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      snapshotError("source changed while snapshotting");
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > DASHBOARD_ASSET_MAX_TOTAL_BYTES) snapshotError("total size limit exceeded");
    const immutableBytes = Uint8Array.from(bytes);
    assets.set(entry.relative, Object.freeze({ bytes: immutableBytes, mimeType: dashboardMimeType(entry.relative)! }));
    const pathBytes = Buffer.from(entry.relative, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(pathBytes.byteLength);
    digest.update(length).update(pathBytes).update(immutableBytes);
  }
  if (!assets.has("dashboard.json")) snapshotError("manifest is missing");

  return Object.freeze({
    assets,
    digest: digest.digest("hex"),
    fileCount: assets.size,
    totalBytes,
  });
}

export function dashboardAssetHeaders(mimeType: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": DASHBOARD_CSP,
    "Content-Type": mimeType,
    "X-Content-Type-Options": "nosniff",
  });
}
