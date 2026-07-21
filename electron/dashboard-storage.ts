import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DASHBOARD_CAPABILITY_IDS,
  DASHBOARD_COLOR_IDS,
  DASHBOARD_ICON_IDS,
  DASHBOARD_KINDS,
  DASHBOARD_NAMESPACE_DIRECTORY,
  DASHBOARD_SCHEMA_VERSION,
  DASHBOARD_SECRET_MAX_COUNT,
  DASHBOARD_SECRET_NAME_PATTERN,
  DASHBOARD_SECRET_ORIGIN_MAX_COUNT,
  DASHBOARD_SECRET_ORIGIN_MAX_LENGTH,
  type DashboardCapabilityId,
  type DashboardCreateInput,
  type DashboardKind,
  type DashboardManifest,
  type DashboardNamespaceConfig,
  type DashboardRemoval,
  type DashboardRegistry,
  type DashboardSecretDeclaration,
  type DashboardStorageLocation,
} from "../src/dashboard-contracts";

// The app-local namespace has no vault.json to activate it: ownership is the
// namespace directory itself, one level below the shared app-local dashboards
// root (`<userData>/dashboards/<vaultKey>`). A vault key is always a 64-char
// lowercase hex HMAC digest (see dashboard-permissions.ts); validating that
// shape here keeps a malformed key from ever being joined into a filesystem
// path.
const DASHBOARD_VAULT_KEY = /^[a-f0-9]{64}$/;

/**
 * Selects which namespace a `DashboardStorage` instance owns: the vault
 * namespace shared through the vault repository, or an app-local namespace
 * private to this installation. Both namespaces share identical layout,
 * validation, atomicity, and trash semantics; only activation differs (see
 * `isConfigured`/`ensureOwnedNamespace`).
 */
export type DashboardStorageRoot = { readonly appLocalRoot: string; readonly vaultKey: string };

const DASHBOARD_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const ENTRYPOINT = /^(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9][A-Za-z0-9._/-]*\.html$/;
const SUPPORTED_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
]);

type VaultConfigRecord = Record<string, unknown> & {
  documentsDirectory?: unknown;
  dashboards?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  const allowed = new Set([...keys, ...optionalKeys]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !(key in value))) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function validateId(value: unknown): string {
  if (typeof value !== "string" || !DASHBOARD_ID.test(value)) throw new Error("Invalid dashboard ID.");
  return value;
}

function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100 || value.trim() !== value) {
    throw new Error("Invalid dashboard title.");
  }
  // Display metadata is plain data; reject markup and control characters at the storage boundary.
  // eslint-disable-next-line no-control-regex -- control characters are intentionally forbidden
  if (/[<>\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid dashboard title.");
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid dashboard ${label}.`);
  return value as T;
}

function parseNamespaceConfig(value: unknown): DashboardNamespaceConfig {
  if (!isRecord(value)) throw new Error("Invalid dashboard namespace configuration.");
  exactKeys(value, ["schemaVersion", "directory"], "dashboard namespace configuration");
  if (value.schemaVersion !== DASHBOARD_SCHEMA_VERSION || value.directory !== DASHBOARD_NAMESPACE_DIRECTORY) {
    throw new Error("Unsupported dashboard namespace configuration.");
  }
  return { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY };
}

function parseRegistry(value: unknown): DashboardRegistry {
  if (!isRecord(value)) throw new Error("Invalid dashboard registry.");
  exactKeys(value, ["schemaVersion", "dashboards"], "dashboard registry");
  if (value.schemaVersion !== DASHBOARD_SCHEMA_VERSION || !Array.isArray(value.dashboards)) {
    throw new Error("Invalid dashboard registry.");
  }
  const ids = new Set<string>();
  const dashboards = value.dashboards.map((raw) => {
    if (!isRecord(raw)) throw new Error("Invalid dashboard registry record.");
    exactKeys(raw, ["id"], "dashboard registry record");
    const id = validateId(raw.id);
    if (ids.has(id)) throw new Error("Duplicate dashboard ID.");
    ids.add(id);
    return { id };
  });
  return { schemaVersion: DASHBOARD_SCHEMA_VERSION, dashboards };
}

// A declared secret may only be sent to origins the user approved in the
// manifest. Without an exact, wildcard-free HTTPS match here, hostile
// dashboard JS could redirect `secureFetch` to an attacker-chosen origin and
// exfiltrate the resolved secret value.
function validateSecretOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > DASHBOARD_SECRET_ORIGIN_MAX_LENGTH) {
    throw new Error("Invalid dashboard secret origin.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("Invalid dashboard secret origin.", { cause: error });
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname.includes("*") ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Invalid dashboard secret origin.");
  }
  const origin = url.origin;
  if (origin.length > DASHBOARD_SECRET_ORIGIN_MAX_LENGTH) throw new Error("Invalid dashboard secret origin.");
  return origin;
}

function parseSecretDeclaration(value: unknown): DashboardSecretDeclaration {
  if (!isRecord(value)) throw new Error("Invalid dashboard secret declaration.");
  exactKeys(value, ["name", "origins"], "dashboard secret declaration");
  if (typeof value.name !== "string" || !DASHBOARD_SECRET_NAME_PATTERN.test(value.name)) {
    throw new Error("Invalid dashboard secret name.");
  }
  if (
    !Array.isArray(value.origins) ||
    value.origins.length < 1 ||
    value.origins.length > DASHBOARD_SECRET_ORIGIN_MAX_COUNT
  ) {
    throw new Error("Invalid dashboard secret origins.");
  }
  return { name: value.name, origins: value.origins.map(validateSecretOrigin) };
}

// `secrets` is optional; a manifest that never declares it must round-trip
// unchanged (no `secrets: []` synthesized), keeping every existing bundle
// byte-for-byte compatible with pre-secrets application versions.
function parseSecretDeclarations(value: unknown): DashboardSecretDeclaration[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > DASHBOARD_SECRET_MAX_COUNT) {
    throw new Error("Invalid dashboard secrets.");
  }
  const secrets = value.map(parseSecretDeclaration);
  if (new Set(secrets.map((secret) => secret.name)).size !== secrets.length) {
    throw new Error("Duplicate dashboard secret name.");
  }
  return secrets;
}

function parseManifest(value: unknown, expectedId: string): DashboardManifest {
  if (!isRecord(value)) throw new Error("Invalid dashboard manifest.");
  exactKeys(
    value,
    ["schemaVersion", "id", "title", "icon", "color", "kind", "entrypoint", "requestedCapabilities"],
    "dashboard manifest",
    ["secrets"],
  );
  if (value.schemaVersion !== DASHBOARD_SCHEMA_VERSION || validateId(value.id) !== expectedId) {
    throw new Error("Invalid dashboard manifest.");
  }
  if (typeof value.entrypoint !== "string" || !ENTRYPOINT.test(value.entrypoint) || path.isAbsolute(value.entrypoint)) {
    throw new Error("Invalid dashboard entrypoint.");
  }
  if (!Array.isArray(value.requestedCapabilities)) throw new Error("Invalid dashboard capabilities.");
  const requestedCapabilities = value.requestedCapabilities.map((capability) =>
    oneOf(capability, DASHBOARD_CAPABILITY_IDS, "capability"),
  );
  if (new Set(requestedCapabilities).size !== requestedCapabilities.length) {
    throw new Error("Duplicate dashboard capability.");
  }
  const secrets = parseSecretDeclarations(value.secrets);
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    id: expectedId,
    title: validateTitle(value.title),
    icon: oneOf(value.icon, DASHBOARD_ICON_IDS, "icon"),
    color: oneOf(value.color, DASHBOARD_COLOR_IDS, "color"),
    kind: oneOf(value.kind, DASHBOARD_KINDS, "kind"),
    entrypoint: value.entrypoint,
    requestedCapabilities,
    ...(secrets !== undefined ? { secrets } : {}),
  };
}

function readJsonStrict(file: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${label}.`, { cause: error });
  }
}

function assertRegularFile(file: string, root: string, label: string): string {
  const stats = fs.lstatSync(file);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Invalid ${label}.`);
  const canonical = fs.realpathSync(file);
  if (!isWithin(root, canonical)) throw new Error(`Invalid ${label}.`);
  return canonical;
}

function assertDirectory(directory: string, root: string, label: string): string {
  const stats = fs.lstatSync(directory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Invalid ${label}.`);
  const canonical = fs.realpathSync(directory);
  if (!isWithin(root, canonical)) throw new Error(`Invalid ${label}.`);
  return canonical;
}

function atomicJson(file: string, value: unknown): void {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function requestedCapabilities(kind: DashboardKind): DashboardCapabilityId[] {
  if (kind === "personal-progress") return ["state:read", "state:write"];
  if (kind === "vault-intelligence") return ["vault:index:read", "vault:documents:read"];
  return [];
}

export class DashboardStorage {
  readonly repositoryRoot: string;
  readonly namespaceRoot: string;
  readonly location: DashboardStorageLocation;
  private readonly kind: DashboardStorageLocation;

  constructor(repositoryPath: string);
  constructor(root: DashboardStorageRoot);
  constructor(root: string | DashboardStorageRoot) {
    if (typeof root === "string") {
      this.kind = "vault";
      this.location = "vault";
      this.repositoryRoot = fs.realpathSync(root);
      this.namespaceRoot = path.join(this.repositoryRoot, ...DASHBOARD_NAMESPACE_DIRECTORY.split("/"));
      return;
    }
    if (!DASHBOARD_VAULT_KEY.test(root.vaultKey)) throw new Error("Invalid dashboard vault key.");
    this.kind = "local";
    this.location = "local";
    // The shared app-local dashboards root (`<userData>/dashboards`) is
    // app-owned and expected to already exist; this instance only owns the
    // one vault-keyed subdirectory beneath it.
    this.repositoryRoot = fs.realpathSync(root.appLocalRoot);
    this.namespaceRoot = path.join(this.repositoryRoot, root.vaultKey);
  }

  isConfigured(): boolean {
    if (this.kind === "local") return fs.existsSync(this.namespaceRoot);
    const config = this.readConfig();
    if (config.dashboards === undefined) return false;
    parseNamespaceConfig(config.dashboards);
    this.assertDocumentsDoNotOwnNamespace(config);
    return true;
  }

  discover(): DashboardManifest[] {
    if (this.kind === "vault") {
      const config = this.readConfig();
      if (config.dashboards === undefined) {
        if (fs.existsSync(this.namespaceRoot)) {
          throw new Error("Dashboard namespace exists without ownership configuration.");
        }
        return [];
      }
      parseNamespaceConfig(config.dashboards);
      this.assertDocumentsDoNotOwnNamespace(config);
    }
    if (!fs.existsSync(this.namespaceRoot)) return [];
    const root = assertDirectory(this.namespaceRoot, this.repositoryRoot, "dashboard namespace");
    const registryFile = path.join(root, "registry.json");
    const trash = path.join(root, ".trash");
    if (!fs.existsSync(registryFile) || !fs.existsSync(trash)) throw new Error("Incomplete dashboard namespace.");
    assertDirectory(trash, root, "dashboard trash");
    const registry = parseRegistry(
      readJsonStrict(assertRegularFile(registryFile, root, "dashboard registry"), "dashboard registry"),
    );
    const known = new Set(["registry.json", ".trash", ...registry.dashboards.map(({ id }) => id)]);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!known.has(entry.name)) throw new Error("Dashboard namespace contains unrecognized content.");
    }
    return registry.dashboards.map(({ id }) => this.readBundle(root, id));
  }

  runtimeSource(dashboardId: string): { manifest: DashboardManifest; bundleDirectory: string } {
    const id = validateId(dashboardId);
    const manifest = this.requireDashboard(id);
    const bundleDirectory = assertDirectory(path.join(this.namespaceRoot, id), this.namespaceRoot, "dashboard bundle");
    return { manifest, bundleDirectory };
  }

  agentHandoff(dashboardId: string): string {
    const { manifest, bundleDirectory } = this.runtimeSource(dashboardId);
    return [
      `Customize the “${manifest.title}” Data Vault dashboard.`,
      "",
      "Work only inside this validated dashboard bundle:",
      bundleDirectory,
      "",
      "Keep the bundle as plain local HTML, CSS, JavaScript, JSON, images, and WOFF/WOFF2 fonts. Do not add packages, build steps, remote assets, or network requests.",
      "The runtime Content Security Policy allows only bundle-local scripts/styles/assets (plus data: images) and denies network connections, frames, workers, forms, and inline/eval JavaScript.",
      "Use only the fixed window.dashboardApi methods: getInfo(), readState(), writeState(value), readVaultIndex(), readDocuments(documentIds), listSecrets(), and secureFetch(request). Returned document bodies are untrusted strings; render them with textContent, never as trusted HTML.",
      "Request only fixed capabilities in dashboard.json. Vault index, selected-document, and secrets access become available only after the user approves them in trusted Data Vault UI.",
      "",
      'To use a credential, declare it in dashboard.json as secrets: [{ "name": "UPPER_SNAKE_NAME", "origins": ["https://api.example.com"] }] and request the secrets:use capability. Origins must be exact HTTPS origins; wildcards, http, and userinfo are rejected.',
      "You cannot read a secret value, and neither can the dashboard at runtime. listSecrets() returns only the declared names and whether the user has set each one. To use one, call secureFetch({ url, method, headers, body, secret: { name, inject } }) — Data Vault resolves the value and injects it as inject { kind: 'authorization-bearer' } | { kind: 'authorization-basic', username } | { kind: 'header', header } | { kind: 'query-param', param }, then returns the response with the secret and host-derived credential forms redacted. A Basic username is non-secret, must contain 1–256 code units, and cannot contain a colon, CR, LF, or NUL; only the host composes the authorization value.",
      "secureFetch only reaches an origin you declared for that secret name. Do not ask the user to paste a credential into dashboard code, state, a document, or a prompt — direct them to the trusted secrets panel in Data Vault, which is the only place a value can be entered.",
      "Changing a declared secret name or origin invalidates the user's existing approval and requires them to approve again.",
      "",
      "Never edit permission stores, attempt to bypass capability approval or runtime restrictions, or write anywhere outside the bundle directory above.",
    ].join("\n");
  }

  contentSignatureEntries(): string[] {
    if (!this.isConfigured()) return [];
    this.discover();
    if (!fs.existsSync(this.namespaceRoot)) return [];
    const entries: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Dashboard namespace cannot contain symbolic links.");
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile()) {
          const canonical = assertRegularFile(absolute, this.namespaceRoot, "dashboard file");
          const stats = fs.statSync(canonical);
          entries.push(
            `${path.relative(this.repositoryRoot, absolute).split(path.sep).join("/")}:${stats.mtimeMs}:${stats.size}`,
          );
        } else throw new Error("Dashboard namespace contains an unsupported filesystem entry.");
      }
    };
    visit(this.namespaceRoot);
    return entries;
  }

  create(input: DashboardCreateInput): DashboardManifest {
    const title = validateTitle(input.title);
    const icon = oneOf(input.icon, DASHBOARD_ICON_IDS, "icon");
    const color = oneOf(input.color, DASHBOARD_COLOR_IDS, "color");
    const kind = oneOf(input.kind, DASHBOARD_KINDS, "kind");
    return this.withOwnedNamespace(() => {
      const registry = this.readRegistry();
      const id = randomUUID();
      const stage = path.join(this.namespaceRoot, `.creating-${id}`);
      const bundle = path.join(this.namespaceRoot, id);
      const manifest: DashboardManifest = {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id,
        title,
        icon,
        color,
        kind,
        entrypoint: "index.html",
        requestedCapabilities: requestedCapabilities(kind),
      };
      let stageCreated = false;
      let bundleCreated = false;
      try {
        if (fs.existsSync(stage) || fs.existsSync(bundle)) throw new Error("Dashboard destination already exists.");
        fs.mkdirSync(stage);
        stageCreated = true;
        atomicJson(path.join(stage, "dashboard.json"), manifest);
        fs.writeFileSync(
          path.join(stage, "index.html"),
          '<!doctype html>\n<html><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body><main id="app"></main><script src="app.js"></script></body></html>\n',
          { flag: "wx" },
        );
        fs.writeFileSync(
          path.join(stage, "styles.css"),
          ":root { color-scheme: light dark; }\nhtml { font-family: system-ui, sans-serif; }\n",
          { flag: "wx" },
        );
        fs.writeFileSync(
          path.join(stage, "app.js"),
          "document.querySelector('#app').textContent = 'Dashboard ready';\n",
          { flag: "wx" },
        );
        fs.renameSync(stage, bundle);
        stageCreated = false;
        bundleCreated = true;
        this.readBundle(this.namespaceRoot, id);
        this.writeRegistry({ ...registry, dashboards: [...registry.dashboards, { id }] });
        return manifest;
      } catch (error) {
        if (stageCreated) fs.rmSync(stage, { recursive: true, force: true });
        if (bundleCreated) fs.rmSync(bundle, { recursive: true, force: true });
        throw error;
      }
    });
  }

  /**
   * Adopts an already-validated bundle directory from another storage (used
   * to move a dashboard between the vault and app-local locations) under the
   * given ID and registers it here. The source is copied byte-for-byte
   * (never re-serialized) so the bundle digest — and therefore existing
   * permission grants, see digestDashboardBundle — is unchanged by the move.
   * Callers must only remove the bundle from its original storage after this
   * call succeeds, so a failure here never duplicates or orphans it.
   */
  adopt(sourceBundleDirectory: string, dashboardId: string): DashboardManifest {
    const id = validateId(dashboardId);
    return this.withOwnedNamespace(() => {
      const registry = this.readRegistry();
      const stage = path.join(this.namespaceRoot, `.creating-${id}`);
      const bundle = path.join(this.namespaceRoot, id);
      let stageCreated = false;
      let bundleCreated = false;
      try {
        if (fs.existsSync(stage) || fs.existsSync(bundle)) throw new Error("Dashboard destination already exists.");
        fs.cpSync(sourceBundleDirectory, stage, { recursive: true, errorOnExist: true, dereference: false });
        stageCreated = true;
        fs.renameSync(stage, bundle);
        stageCreated = false;
        bundleCreated = true;
        const manifest = this.readBundle(this.namespaceRoot, id);
        this.writeRegistry({ ...registry, dashboards: [...registry.dashboards, { id }] });
        return manifest;
      } catch (error) {
        if (stageCreated) fs.rmSync(stage, { recursive: true, force: true });
        if (bundleCreated) fs.rmSync(bundle, { recursive: true, force: true });
        throw error;
      }
    });
  }

  rename(dashboardId: string, title: string): DashboardManifest {
    const id = validateId(dashboardId);
    const nextTitle = validateTitle(title);
    const manifest = this.requireDashboard(id);
    const file = path.join(this.namespaceRoot, id, "dashboard.json");
    atomicJson(file, { ...manifest, title: nextTitle });
    return this.requireDashboard(id);
  }

  reorder(dashboardIds: string[]): DashboardManifest[] {
    if (!Array.isArray(dashboardIds)) throw new Error("Invalid dashboard order.");
    const ids = dashboardIds.map(validateId);
    if (new Set(ids).size !== ids.length) throw new Error("Invalid dashboard order.");
    const registry = this.readRegistry();
    const existing = registry.dashboards.map(({ id }) => id);
    if (ids.length !== existing.length || ids.some((id) => !existing.includes(id))) {
      throw new Error("Dashboard order must contain every registered dashboard exactly once.");
    }
    this.writeRegistry({ schemaVersion: DASHBOARD_SCHEMA_VERSION, dashboards: ids.map((id) => ({ id })) });
    return this.discover();
  }

  remove(dashboardId: string, removalId: string = randomUUID()): DashboardRemoval {
    const id = validateId(dashboardId);
    validateId(removalId);
    this.requireDashboard(id);
    const registry = this.readRegistry();
    const source = path.join(this.namespaceRoot, id);
    const trash = path.join(this.namespaceRoot, ".trash");
    assertDirectory(trash, this.namespaceRoot, "dashboard trash");
    const destination = path.join(trash, `${id}-${removalId}`);
    if (fs.existsSync(destination)) throw new Error("Dashboard trash destination already exists.");
    fs.renameSync(source, destination);
    try {
      this.writeRegistry({
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        dashboards: registry.dashboards.filter((record) => record.id !== id),
      });
    } catch (error) {
      if (fs.existsSync(source) || !fs.existsSync(destination)) {
        throw new Error("Dashboard removal failed and could not be rolled back safely.", { cause: error });
      }
      fs.renameSync(destination, source);
      throw error;
    }
    return { dashboardId: id, trashPath: path.relative(this.repositoryRoot, destination).split(path.sep).join("/") };
  }

  private requireDashboard(id: string): DashboardManifest {
    const dashboards = this.discover();
    const dashboard = dashboards.find((candidate) => candidate.id === id);
    if (!dashboard) throw new Error("Dashboard not found.");
    return dashboard;
  }

  private readBundle(root: string, id: string): DashboardManifest {
    const bundlePath = path.join(root, id);
    const bundle = assertDirectory(bundlePath, root, "dashboard bundle");
    const manifestFile = path.join(bundle, "dashboard.json");
    const manifest = parseManifest(
      readJsonStrict(assertRegularFile(manifestFile, bundle, "dashboard manifest"), "dashboard manifest"),
      id,
    );
    this.validateBundleFiles(bundle);
    const entrypoint = path.resolve(bundle, manifest.entrypoint);
    if (!isWithin(bundle, entrypoint) || !fs.existsSync(entrypoint)) throw new Error("Dashboard entrypoint not found.");
    assertRegularFile(entrypoint, bundle, "dashboard entrypoint");
    return manifest;
  }

  private validateBundleFiles(bundle: string): void {
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Dashboard bundles cannot contain symbolic links.");
        if (entry.isDirectory()) {
          assertDirectory(absolute, bundle, "dashboard asset directory");
          visit(absolute);
        } else if (entry.isFile()) {
          assertRegularFile(absolute, bundle, "dashboard asset");
          if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            throw new Error("Dashboard bundle contains an unsupported file.");
          }
        } else {
          throw new Error("Dashboard bundle contains an unsupported filesystem entry.");
        }
      }
    };
    visit(bundle);
  }

  private readRegistry(): DashboardRegistry {
    this.discover();
    return parseRegistry(readJsonStrict(path.join(this.namespaceRoot, "registry.json"), "dashboard registry"));
  }

  private writeRegistry(registry: DashboardRegistry): void {
    parseRegistry(registry);
    atomicJson(path.join(this.namespaceRoot, "registry.json"), registry);
  }

  // Shared by `create` and `adopt`: captures enough state to roll back a
  // namespace this call activates, so a failure partway through either
  // operation never leaves a half-initialized namespace or a mutated
  // vault.json behind.
  private withOwnedNamespace<T>(action: () => T): T {
    const configFile = this.kind === "vault" ? path.join(this.repositoryRoot, "vault.json") : null;
    const originalConfig = configFile !== null && fs.existsSync(configFile) ? fs.readFileSync(configFile) : null;
    const namespaceCreated = this.ensureOwnedNamespace();
    try {
      return action();
    } catch (error) {
      if (namespaceCreated) this.rollbackNewNamespace(originalConfig);
      throw error;
    }
  }

  private ensureOwnedNamespace(): boolean {
    if (this.kind === "local") {
      if (fs.existsSync(this.namespaceRoot)) {
        // Fails closed the same way the vault branch below does: wrong type,
        // symlink, or incomplete/unrecognized content all throw here.
        this.discover();
        return false;
      }
      // The parent (the shared app-local dashboards root) is app-owned and
      // pre-created by VaultService; a missing or non-directory parent is a
      // configuration error, not something to silently create.
      assertDirectory(path.dirname(this.namespaceRoot), this.repositoryRoot, "dashboard namespace parent");
      fs.mkdirSync(this.namespaceRoot);
      fs.mkdirSync(path.join(this.namespaceRoot, ".trash"));
      atomicJson(path.join(this.namespaceRoot, "registry.json"), {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        dashboards: [],
      } satisfies DashboardRegistry);
      return true;
    }

    const config = this.readConfig();
    if (config.dashboards === undefined && fs.existsSync(this.namespaceRoot)) {
      throw new Error("Dashboard namespace exists without ownership configuration.");
    }
    if (config.dashboards !== undefined) {
      parseNamespaceConfig(config.dashboards);
      this.assertDocumentsDoNotOwnNamespace(config);
      if (fs.existsSync(this.namespaceRoot)) {
        this.discover();
        return false;
      }
    } else {
      this.assertDocumentsDoNotOwnNamespace(config);
    }

    const parent = path.dirname(this.namespaceRoot);
    if (fs.existsSync(parent)) assertDirectory(parent, this.repositoryRoot, "dashboard namespace parent");
    else fs.mkdirSync(parent);
    fs.mkdirSync(this.namespaceRoot);
    fs.mkdirSync(path.join(this.namespaceRoot, ".trash"));
    atomicJson(path.join(this.namespaceRoot, "registry.json"), {
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      dashboards: [],
    } satisfies DashboardRegistry);
    try {
      if (config.dashboards === undefined) {
        this.writeConfig({
          ...config,
          dashboards: { schemaVersion: DASHBOARD_SCHEMA_VERSION, directory: DASHBOARD_NAMESPACE_DIRECTORY },
        });
      }
    } catch (error) {
      fs.rmSync(this.namespaceRoot, { recursive: true, force: true });
      throw error;
    }
    return true;
  }

  private rollbackNewNamespace(originalConfig: Buffer | null): void {
    fs.rmSync(this.namespaceRoot, { recursive: true, force: true });
    if (this.kind === "local") return;
    const configFile = path.join(this.repositoryRoot, "vault.json");
    if (originalConfig === null) fs.rmSync(configFile, { force: true });
    else fs.writeFileSync(configFile, originalConfig);
  }

  private assertDocumentsDoNotOwnNamespace(config: VaultConfigRecord): void {
    const configured =
      typeof config.documentsDirectory === "string" && config.documentsDirectory
        ? config.documentsDirectory
        : "documents";
    if (path.isAbsolute(configured)) throw new Error("documentsDirectory must be relative.");
    const documents = path.resolve(this.repositoryRoot, configured);
    if (isWithin(this.namespaceRoot, documents)) {
      throw new Error("Documents directory overlaps the dashboard namespace.");
    }
  }

  private readConfig(): VaultConfigRecord {
    const file = path.join(this.repositoryRoot, "vault.json");
    if (!fs.existsSync(file)) return {};
    const value = readJsonStrict(file, "vault configuration");
    if (!isRecord(value)) throw new Error("Invalid vault configuration.");
    return value as VaultConfigRecord;
  }

  private writeConfig(config: VaultConfigRecord): void {
    atomicJson(path.join(this.repositoryRoot, "vault.json"), config);
  }
}
