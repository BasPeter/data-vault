import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  DASHBOARD_CAPABILITY_IDS,
  DASHBOARD_LOCAL_CAPABILITY_IDS,
  DASHBOARD_PRIVILEGED_CAPABILITY_IDS,
  DASHBOARD_SCHEMA_VERSION,
  type DashboardCapabilityId,
  type DashboardEffectivePermissions,
} from "../src/dashboard-contracts";

const DASHBOARD_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SECURITY_DIGEST = /^[a-f0-9]{64}$/;
const SALT_BYTES = 32;
const STORE_MAX_BYTES = 1024 * 1024;

type PermissionGrant = {
  vaultKey: string;
  dashboardId: string;
  requestDigest: string;
  bundleDigest: string;
  grantedCapabilities: DashboardCapabilityId[];
  selectedDocumentIds: string[];
};

type PermissionFile = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  grants: PermissionGrant[];
};

export type DashboardPermissionContext = {
  repositoryPath: string;
  dashboardId: string;
  requestedCapabilities: readonly DashboardCapabilityId[];
  bundleDigest: string;
};

export type DashboardBundleDigestFile = {
  path: string;
  bytes: Uint8Array;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function validateCapabilityList(
  value: unknown,
  allowed: readonly DashboardCapabilityId[] = DASHBOARD_CAPABILITY_IDS,
): DashboardCapabilityId[] {
  if (!Array.isArray(value)) throw new Error("Invalid dashboard capability request.");
  const requested = value.map((capability) => {
    if (typeof capability !== "string" || !allowed.includes(capability as DashboardCapabilityId)) {
      throw new Error("Invalid dashboard capability request.");
    }
    return capability as DashboardCapabilityId;
  });
  if (new Set(requested).size !== requested.length) throw new Error("Invalid dashboard capability request.");
  return DASHBOARD_CAPABILITY_IDS.filter((capability) => requested.includes(capability));
}

function validateDocumentId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    // eslint-disable-next-line no-control-regex -- control characters are forbidden in stable document IDs
    /[\x00-\x1f\x7f\\]/.test(value) ||
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    value.startsWith("//") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid dashboard document selection.");
  }
  return value;
}

export function canonicalDashboardCapabilityRequest(
  requestedCapabilities: readonly DashboardCapabilityId[],
): DashboardCapabilityId[] {
  return validateCapabilityList(requestedCapabilities);
}

export function dashboardCapabilityRequestDigest(requestedCapabilities: readonly DashboardCapabilityId[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalDashboardCapabilityRequest(requestedCapabilities)))
    .digest("hex");
}

export function digestDashboardBundle(files: readonly DashboardBundleDigestFile[]): string {
  const normalized = files
    .filter((file) => file.path !== "state.json")
    .map((file) => {
      const relative = file.path.replaceAll("\\", "/");
      if (
        !relative ||
        relative !== file.path ||
        path.posix.isAbsolute(relative) ||
        relative.split("/").some((segment) => !segment || segment === "." || segment === "..")
      ) {
        throw new Error("Invalid dashboard bundle digest input.");
      }
      return { path: relative, bytes: Buffer.from(file.bytes) };
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  if (new Set(normalized.map((file) => file.path)).size !== normalized.length) {
    throw new Error("Invalid dashboard bundle digest input.");
  }
  const hash = createHash("sha256").update("data-vault-dashboard-bundle-v1\0");
  for (const file of normalized) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const header = Buffer.alloc(8);
    header.writeUInt32BE(pathBytes.length, 0);
    header.writeUInt32BE(file.bytes.length, 4);
    hash.update(header).update(pathBytes).update(file.bytes);
  }
  return hash.digest("hex");
}

function parsePermissionFile(value: unknown): PermissionFile {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["schemaVersion", "grants"]) ||
    value.schemaVersion !== DASHBOARD_SCHEMA_VERSION
  ) {
    throw new Error("Invalid dashboard permission store.");
  }
  if (!Array.isArray(value.grants)) throw new Error("Invalid dashboard permission store.");
  const grants = value.grants.map((candidate): PermissionGrant => {
    if (
      !isRecord(candidate) ||
      !exactKeys(candidate, [
        "vaultKey",
        "dashboardId",
        "requestDigest",
        "bundleDigest",
        "grantedCapabilities",
        "selectedDocumentIds",
      ]) ||
      typeof candidate.vaultKey !== "string" ||
      !SECURITY_DIGEST.test(candidate.vaultKey) ||
      typeof candidate.dashboardId !== "string" ||
      !DASHBOARD_ID.test(candidate.dashboardId) ||
      typeof candidate.requestDigest !== "string" ||
      !SECURITY_DIGEST.test(candidate.requestDigest) ||
      typeof candidate.bundleDigest !== "string" ||
      !SECURITY_DIGEST.test(candidate.bundleDigest) ||
      !Array.isArray(candidate.selectedDocumentIds)
    ) {
      throw new Error("Invalid dashboard permission store.");
    }
    const grantedCapabilities = validateCapabilityList(
      candidate.grantedCapabilities,
      DASHBOARD_PRIVILEGED_CAPABILITY_IDS,
    );
    const selectedDocumentIds = candidate.selectedDocumentIds.map(validateDocumentId);
    if (new Set(selectedDocumentIds).size !== selectedDocumentIds.length) {
      throw new Error("Invalid dashboard permission store.");
    }
    return {
      vaultKey: candidate.vaultKey,
      dashboardId: candidate.dashboardId,
      requestDigest: candidate.requestDigest,
      bundleDigest: candidate.bundleDigest,
      grantedCapabilities,
      selectedDocumentIds: [...selectedDocumentIds].sort(),
    };
  });
  const keys = grants.map((grant) =>
    [grant.vaultKey, grant.dashboardId, grant.requestDigest, grant.bundleDigest].join("\0"),
  );
  if (new Set(keys).size !== keys.length) throw new Error("Invalid dashboard permission store.");
  return { schemaVersion: DASHBOARD_SCHEMA_VERSION, grants };
}

function atomicPrivateFile(file: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Windows does not provide POSIX permission bits; the private app-data location remains authoritative.
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export class DashboardPermissionStore {
  private readonly saltFile: string;
  private readonly permissionsFile: string;

  constructor(userDataDirectory: string) {
    this.saltFile = path.join(userDataDirectory, "dashboard-permissions.salt");
    this.permissionsFile = path.join(userDataDirectory, "dashboard-permissions.json");
  }

  effective(context: DashboardPermissionContext): DashboardEffectivePermissions {
    const requested = canonicalDashboardCapabilityRequest(context.requestedCapabilities);
    const local: DashboardCapabilityId[] = DASHBOARD_LOCAL_CAPABILITY_IDS.filter((capability) =>
      requested.includes(capability),
    );
    try {
      const match = this.findGrant(context, requested, this.read());
      if (!match) {
        return { schemaVersion: DASHBOARD_SCHEMA_VERSION, capabilities: local, selectedDocumentIds: [] };
      }
      const privileged: DashboardCapabilityId[] = DASHBOARD_PRIVILEGED_CAPABILITY_IDS.filter(
        (capability) => requested.includes(capability) && match.grantedCapabilities.includes(capability),
      );
      return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        capabilities: DASHBOARD_CAPABILITY_IDS.filter(
          (capability) => local.includes(capability) || privileged.includes(capability),
        ),
        selectedDocumentIds: privileged.includes("vault:documents:read") ? [...match.selectedDocumentIds] : [],
      };
    } catch {
      return { schemaVersion: DASHBOARD_SCHEMA_VERSION, capabilities: local, selectedDocumentIds: [] };
    }
  }

  grant(
    context: DashboardPermissionContext,
    grantedCapabilities: readonly DashboardCapabilityId[],
    selectedDocumentIds: readonly string[] = [],
  ): DashboardEffectivePermissions {
    const requested = canonicalDashboardCapabilityRequest(context.requestedCapabilities);
    const privileged = validateCapabilityList(grantedCapabilities, DASHBOARD_PRIVILEGED_CAPABILITY_IDS);
    if (privileged.some((capability) => !requested.includes(capability))) {
      throw new Error("Cannot grant an unrequested dashboard capability.");
    }
    const selection = selectedDocumentIds.map(validateDocumentId);
    if (new Set(selection).size !== selection.length || selection.length > 2_000) {
      throw new Error("Invalid dashboard document selection.");
    }
    if (!privileged.includes("vault:documents:read") && selection.length > 0) {
      throw new Error("Selected documents require document-read access.");
    }
    const current = this.read();
    const identity = this.identity(context, requested);
    // One dashboard has one active approval lineage in a vault. Replacing a grant
    // removes every stale request/bundle tuple so reverting repository content can
    // never revive authority that the user superseded.
    const grants = current.grants.filter((grant) => !this.matchesDashboard(grant, identity));
    grants.push({
      ...identity,
      grantedCapabilities: privileged,
      selectedDocumentIds: [...selection].sort(),
    });
    this.write({ schemaVersion: DASHBOARD_SCHEMA_VERSION, grants });
    return this.effective(context);
  }

  revoke(context: DashboardPermissionContext): void {
    const requested = canonicalDashboardCapabilityRequest(context.requestedCapabilities);
    const current = this.read();
    const identity = this.identity(context, requested);
    this.write({
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      // Revocation applies to the dashboard, not only its currently visible tuple.
      // This prevents an older approved bundle/request from regaining access after
      // a repository revert while preserving grants for other dashboards.
      grants: current.grants.filter((grant) => !this.matchesDashboard(grant, identity)),
    });
  }

  private findGrant(
    context: DashboardPermissionContext,
    requested: DashboardCapabilityId[],
    file: PermissionFile,
  ): PermissionGrant | undefined {
    const identity = this.identity(context, requested);
    return file.grants.find((grant) => this.matchesIdentity(grant, identity));
  }

  private identity(
    context: DashboardPermissionContext,
    requested: DashboardCapabilityId[],
  ): Pick<PermissionGrant, "vaultKey" | "dashboardId" | "requestDigest" | "bundleDigest"> {
    if (!DASHBOARD_ID.test(context.dashboardId) || !SECURITY_DIGEST.test(context.bundleDigest)) {
      throw new Error("Invalid dashboard permission context.");
    }
    const canonicalRoot = fs.realpathSync(context.repositoryPath);
    if (!fs.statSync(canonicalRoot).isDirectory()) throw new Error("Invalid dashboard permission context.");
    const vaultKey = createHmac("sha256", this.salt()).update(canonicalRoot, "utf8").digest("hex");
    return {
      vaultKey,
      dashboardId: context.dashboardId,
      requestDigest: dashboardCapabilityRequestDigest(requested),
      bundleDigest: context.bundleDigest,
    };
  }

  private matchesIdentity(
    grant: PermissionGrant,
    identity: Pick<PermissionGrant, "vaultKey" | "dashboardId" | "requestDigest" | "bundleDigest">,
  ): boolean {
    return (
      grant.vaultKey === identity.vaultKey &&
      grant.dashboardId === identity.dashboardId &&
      grant.requestDigest === identity.requestDigest &&
      grant.bundleDigest === identity.bundleDigest
    );
  }

  private matchesDashboard(
    grant: PermissionGrant,
    identity: Pick<PermissionGrant, "vaultKey" | "dashboardId">,
  ): boolean {
    return grant.vaultKey === identity.vaultKey && grant.dashboardId === identity.dashboardId;
  }

  private salt(): Buffer {
    if (!fs.existsSync(this.saltFile)) {
      const salt = randomBytes(SALT_BYTES);
      atomicPrivateFile(this.saltFile, salt.toString("hex"));
      return salt;
    }
    const stats = fs.lstatSync(this.saltFile);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size !== SALT_BYTES * 2) {
      throw new Error("Invalid dashboard permission salt.");
    }
    const encoded = fs.readFileSync(this.saltFile, "utf8");
    if (!/^[a-f0-9]{64}$/.test(encoded)) throw new Error("Invalid dashboard permission salt.");
    return Buffer.from(encoded, "hex");
  }

  private read(): PermissionFile {
    if (!fs.existsSync(this.permissionsFile)) return { schemaVersion: DASHBOARD_SCHEMA_VERSION, grants: [] };
    const stats = fs.lstatSync(this.permissionsFile);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size > STORE_MAX_BYTES) {
      throw new Error("Invalid dashboard permission store.");
    }
    return parsePermissionFile(JSON.parse(fs.readFileSync(this.permissionsFile, "utf8")));
  }

  private write(file: PermissionFile): void {
    const canonical: PermissionFile = {
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      grants: [...file.grants].sort((left, right) =>
        [left.vaultKey, left.dashboardId, left.requestDigest, left.bundleDigest]
          .join("\0")
          .localeCompare([right.vaultKey, right.dashboardId, right.requestDigest, right.bundleDigest].join("\0")),
      ),
    };
    const encoded = `${JSON.stringify(canonical, null, 2)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > STORE_MAX_BYTES)
      throw new Error("Dashboard permission store is too large.");
    atomicPrivateFile(this.permissionsFile, encoded);
  }
}
