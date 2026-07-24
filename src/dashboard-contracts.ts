export const DASHBOARD_SCHEMA_VERSION = 1 as const;
export const DASHBOARD_NAMESPACE_DIRECTORY = ".data-vault/dashboards" as const;

export const DASHBOARD_CAPABILITY_IDS = [
  "state:read",
  "state:write",
  "vault:index:read",
  "vault:documents:read",
  "secrets:use",
] as const;

export type DashboardCapabilityId = (typeof DASHBOARD_CAPABILITY_IDS)[number];

export const DASHBOARD_LOCAL_CAPABILITY_IDS = [
  "state:read",
  "state:write",
] as const satisfies readonly DashboardCapabilityId[];

export const DASHBOARD_PRIVILEGED_CAPABILITY_IDS = [
  "vault:index:read",
  "vault:documents:read",
  "secrets:use",
] as const satisfies readonly DashboardCapabilityId[];

export const DASHBOARD_STORAGE_LOCATIONS = ["vault", "local"] as const;
export type DashboardStorageLocation = (typeof DASHBOARD_STORAGE_LOCATIONS)[number];

export const DASHBOARD_KINDS = ["personal-progress", "vault-intelligence", "blank"] as const;
export type DashboardKind = (typeof DASHBOARD_KINDS)[number];

export const DASHBOARD_ICON_IDS = ["chart", "check", "compass", "lightbulb", "target"] as const;
export type DashboardIconId = (typeof DASHBOARD_ICON_IDS)[number];

export const DASHBOARD_COLOR_IDS = ["blue", "green", "orange", "purple", "slate"] as const;
export type DashboardColorId = (typeof DASHBOARD_COLOR_IDS)[number];

export type DashboardNamespaceConfig = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  directory: typeof DASHBOARD_NAMESPACE_DIRECTORY;
};

export type DashboardRegistryRecord = {
  id: string;
};

export type DashboardRegistry = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  dashboards: DashboardRegistryRecord[];
};

export const DASHBOARD_SECRET_NAME_PATTERN = /^[A-Z0-9_]{1,64}$/;
export const DASHBOARD_SECRET_MAX_COUNT = 10;
export const DASHBOARD_SECRET_ORIGIN_MAX_COUNT = 5;
export const DASHBOARD_SECRET_ORIGIN_MAX_LENGTH = 253;
export const DASHBOARD_SECRET_VALUE_MIN_LENGTH = 8;
export const DASHBOARD_SECRET_VALUE_MAX_LENGTH = 4096;

/**
 * A dashboard's declared need for a named secret, bound to the exact origins the
 * secret may be sent to. Declared in the manifest and covered by the capability
 * request digest, so changing it invalidates existing grants.
 */
export type DashboardSecretDeclaration = {
  name: string;
  origins: string[];
};

export type DashboardManifest = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  id: string;
  title: string;
  icon: DashboardIconId;
  color: DashboardColorId;
  kind: DashboardKind;
  entrypoint: string;
  requestedCapabilities: DashboardCapabilityId[];
  secrets?: DashboardSecretDeclaration[];
};

/**
 * A discovered dashboard as presented to trusted UI. `location` is derived from
 * the storage that owns the bundle and is never read from repository content.
 */
export type DashboardListEntry = DashboardManifest & {
  location: DashboardStorageLocation;
};

export type DashboardCreateInput = {
  title: string;
  icon: DashboardIconId;
  color: DashboardColorId;
  kind: DashboardKind;
  location: DashboardStorageLocation;
};

export type DashboardRemoval = { dashboardId: string; trashPath: string };

export const DASHBOARD_DOCUMENT_SCOPES = ["selected", "all"] as const;
export type DashboardDocumentScope = (typeof DASHBOARD_DOCUMENT_SCOPES)[number];

export type DashboardEffectivePermissions = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  capabilities: DashboardCapabilityId[];
  documentScope: DashboardDocumentScope;
  selectedDocumentIds: string[];
};

export type DashboardPermissionDetails = {
  requestedCapabilities: DashboardCapabilityId[];
  effectivePermissions: DashboardEffectivePermissions;
  documents: Array<{ id: string; title: string }>;
  secrets: Array<DashboardSecretDeclaration & { set: boolean }>;
};

/**
 * Trusted-UI view of one secret. Carries status only; a stored value is never
 * returned to the renderer.
 */
export type DashboardSecretRequirement = {
  name: string;
  set: boolean;
  origins: string[];
  requiredBy: Array<{ dashboardId: string; title: string }>;
};

export type DashboardSecretsOverview = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  available: boolean;
  secrets: DashboardSecretRequirement[];
};

export type DashboardRuntimeHostStatus = {
  runtimeId: string;
  status: "loading" | "ready" | "failed" | "unresponsive" | "stopped";
  attached: boolean;
} | null;

/**
 * The opaque descriptor the trusted renderer needs to mount the dashboard
 * `<webview>`: the isolated session partition to attach to and the asset origin
 * to load. Both are validated against the prepared runtime when the guest
 * attaches, so a renderer cannot repoint the element at another runtime.
 */
export type DashboardRuntimeDescriptor = {
  runtimeId: string;
  partition: string;
  src: string;
};

export type DashboardJsonPrimitive = boolean | number | string | null;
export type DashboardJsonValue = DashboardJsonPrimitive | DashboardJsonValue[] | { [key: string]: DashboardJsonValue };
export type DashboardState = DashboardJsonValue;

export const DASHBOARD_STATE_MAX_BYTES = 1024 * 1024;
export const DASHBOARD_STATE_MAX_WRITES_PER_MINUTE = 30;
export const DASHBOARD_DOCUMENT_ID_MAX_LENGTH = 512;
export const DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT = 20;
export const DASHBOARD_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;
export const DASHBOARD_DOCUMENTS_RESPONSE_MAX_BYTES = 5 * 1024 * 1024;
export const DASHBOARD_INDEX_MAX_DOCUMENTS = 2_000;
export const DASHBOARD_INDEX_MAX_LINKS_PER_DOCUMENT = 100;
export const DASHBOARD_INDEX_MAX_TAGS_PER_DOCUMENT = 50;
export const DASHBOARD_INDEX_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const DASHBOARD_SECURE_FETCH_URL_MAX_LENGTH = 2048;
export const DASHBOARD_SECURE_FETCH_REQUEST_MAX_BYTES = 256 * 1024;
export const DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const DASHBOARD_SECURE_FETCH_TIMEOUT_MS = 15_000;
export const DASHBOARD_EXTERNAL_LINK_URL_MAX_LENGTH = 8_192;
// Secure fetches share the runtime's expensive-read budget rather than having a
// dedicated one, so a dashboard cannot use them to bypass that limit.
export const DASHBOARD_SECURE_FETCH_REQUEST_HEADER_MAX_COUNT = 16;
export const DASHBOARD_SECURE_FETCH_RESPONSE_HEADER_MAX_COUNT = 32;
export const DASHBOARD_SECURE_FETCH_HEADER_VALUE_MAX_LENGTH = 1024;

export type DashboardInfo = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  id: string;
  title: string;
  icon: DashboardIconId;
  color: DashboardColorId;
  kind: DashboardKind;
  effectivePermissions: DashboardEffectivePermissions;
};

export type DashboardDocumentMetadata = {
  date: string | null;
};

export type DashboardVaultIndexDocument = {
  id: string;
  title: string;
  metadata: DashboardDocumentMetadata;
  tags: string[];
  links: string[];
};

export type DashboardVaultIndexSnapshot = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  documents: DashboardVaultIndexDocument[];
  truncated: boolean;
  limits: {
    maxDocuments: typeof DASHBOARD_INDEX_MAX_DOCUMENTS;
    maxLinksPerDocument: typeof DASHBOARD_INDEX_MAX_LINKS_PER_DOCUMENT;
    maxTagsPerDocument: typeof DASHBOARD_INDEX_MAX_TAGS_PER_DOCUMENT;
    maxEncodedBytes: typeof DASHBOARD_INDEX_RESPONSE_MAX_BYTES;
  };
};

export type DashboardDocumentSnapshot = {
  id: string;
  title: string;
  format: "html" | "markdown";
  contentTrust: "untrusted";
  content: string;
};

export type DashboardDocumentsSnapshot = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  documents: DashboardDocumentSnapshot[];
  limits: {
    maxDocuments: typeof DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT;
    maxDocumentBytes: typeof DASHBOARD_DOCUMENT_MAX_BYTES;
    maxEncodedBytes: typeof DASHBOARD_DOCUMENTS_RESPONSE_MAX_BYTES;
  };
};

export const DASHBOARD_SECURE_FETCH_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type DashboardSecureFetchMethod = (typeof DASHBOARD_SECURE_FETCH_METHODS)[number];
export const DASHBOARD_BASIC_AUTH_USERNAME_MAX_LENGTH = 256 as const;

/**
 * Where the main process places the resolved secret value. Dashboard code chooses
 * the injection point but never supplies or observes the value itself.
 */
export type DashboardSecretInjection =
  | { kind: "authorization-bearer" }
  | { kind: "authorization-basic"; username: string }
  | { kind: "header"; header: string }
  | { kind: "query-param"; param: string };

export type DashboardSecretStatus = {
  name: string;
  set: boolean;
};

export type DashboardSecureFetchInput = {
  url: string;
  method: DashboardSecureFetchMethod;
  headers?: Record<string, string>;
  body?: string;
  secret: { name: string; inject: DashboardSecretInjection };
};

export type DashboardSecureFetchResult = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
};

export type DashboardListSecretsResult = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  available: boolean;
  secrets: DashboardSecretStatus[];
};

export type DashboardGetInfoRequest = undefined;
export type DashboardGetInfoResponse = DashboardInfo;
export type DashboardReadStateRequest = undefined;
export type DashboardReadStateResponse = DashboardState;
export type DashboardWriteStateRequest = { state: DashboardState };
export type DashboardWriteStateResponse = { saved: true };
export type DashboardReadVaultIndexRequest = undefined;
export type DashboardReadVaultIndexResponse = DashboardVaultIndexSnapshot;
export type DashboardReadDocumentsRequest = { documentIds: string[] };
export type DashboardReadDocumentsResponse = DashboardDocumentsSnapshot;
export type DashboardListSecretsRequest = undefined;
export type DashboardListSecretsResponse = DashboardListSecretsResult;
export type DashboardSecureFetchRequest = { request: DashboardSecureFetchInput };
export type DashboardSecureFetchResponse = DashboardSecureFetchResult;
export type DashboardOpenExternalLinkRequest = { url: string };
export type DashboardOpenExternalLinkResponse = { opened: true } | { opened: false };

export type DashboardApi = {
  getInfo: () => Promise<DashboardGetInfoResponse>;
  readState: () => Promise<DashboardReadStateResponse>;
  writeState: (state: DashboardState) => Promise<DashboardWriteStateResponse>;
  readVaultIndex: () => Promise<DashboardReadVaultIndexResponse>;
  readDocuments: (documentIds: string[]) => Promise<DashboardReadDocumentsResponse>;
  listSecrets: () => Promise<DashboardListSecretsResponse>;
  secureFetch: (request: DashboardSecureFetchInput) => Promise<DashboardSecureFetchResponse>;
  openExternalLink: (request: DashboardOpenExternalLinkRequest) => Promise<DashboardOpenExternalLinkResponse>;
};

export type DashboardApiRequestMap = {
  getInfo: DashboardGetInfoRequest;
  readState: DashboardReadStateRequest;
  writeState: DashboardWriteStateRequest;
  readVaultIndex: DashboardReadVaultIndexRequest;
  readDocuments: DashboardReadDocumentsRequest;
  listSecrets: DashboardListSecretsRequest;
  secureFetch: DashboardSecureFetchRequest;
  openExternalLink: DashboardOpenExternalLinkRequest;
};

export type DashboardApiResponseMap = {
  getInfo: DashboardGetInfoResponse;
  readState: DashboardReadStateResponse;
  writeState: DashboardWriteStateResponse;
  readVaultIndex: DashboardReadVaultIndexResponse;
  readDocuments: DashboardReadDocumentsResponse;
  listSecrets: DashboardListSecretsResponse;
  secureFetch: DashboardSecureFetchResponse;
  openExternalLink: DashboardOpenExternalLinkResponse;
};

export type DashboardApiErrorCode =
  | "invalid-request"
  | "permission-denied"
  | "resource-limit"
  | "state-invalid"
  | "unavailable"
  | "secret-unset";

export type DashboardApiError = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  code: DashboardApiErrorCode;
  message: string;
};

declare global {
  interface Window {
    dashboardApi: DashboardApi;
  }
}
