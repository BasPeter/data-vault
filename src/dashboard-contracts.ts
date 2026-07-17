export const DASHBOARD_SCHEMA_VERSION = 1 as const;
export const DASHBOARD_NAMESPACE_DIRECTORY = ".data-vault/dashboards" as const;

export const DASHBOARD_CAPABILITY_IDS = [
  "state:read",
  "state:write",
  "vault:index:read",
  "vault:documents:read",
] as const;

export type DashboardCapabilityId = (typeof DASHBOARD_CAPABILITY_IDS)[number];

export const DASHBOARD_LOCAL_CAPABILITY_IDS = [
  "state:read",
  "state:write",
] as const satisfies readonly DashboardCapabilityId[];

export const DASHBOARD_PRIVILEGED_CAPABILITY_IDS = [
  "vault:index:read",
  "vault:documents:read",
] as const satisfies readonly DashboardCapabilityId[];

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

export type DashboardManifest = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  id: string;
  title: string;
  icon: DashboardIconId;
  color: DashboardColorId;
  kind: DashboardKind;
  entrypoint: string;
  requestedCapabilities: DashboardCapabilityId[];
};

export type DashboardCreateInput = {
  title: string;
  icon: DashboardIconId;
  color: DashboardColorId;
  kind: DashboardKind;
};

export type DashboardRemoval = { dashboardId: string; trashPath: string };

export type DashboardEffectivePermissions = {
  schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  capabilities: DashboardCapabilityId[];
  selectedDocumentIds: string[];
};

export type DashboardPermissionDetails = {
  requestedCapabilities: DashboardCapabilityId[];
  effectivePermissions: DashboardEffectivePermissions;
  documents: Array<{ id: string; title: string }>;
};

export type DashboardRuntimeHostStatus = {
  runtimeId: string;
  status: "loading" | "ready" | "failed" | "unresponsive" | "stopped";
  attached: boolean;
} | null;

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

export type DashboardApi = {
  getInfo: () => Promise<DashboardGetInfoResponse>;
  readState: () => Promise<DashboardReadStateResponse>;
  writeState: (state: DashboardState) => Promise<DashboardWriteStateResponse>;
  readVaultIndex: () => Promise<DashboardReadVaultIndexResponse>;
  readDocuments: (documentIds: string[]) => Promise<DashboardReadDocumentsResponse>;
};

export type DashboardApiRequestMap = {
  getInfo: DashboardGetInfoRequest;
  readState: DashboardReadStateRequest;
  writeState: DashboardWriteStateRequest;
  readVaultIndex: DashboardReadVaultIndexRequest;
  readDocuments: DashboardReadDocumentsRequest;
};

export type DashboardApiResponseMap = {
  getInfo: DashboardGetInfoResponse;
  readState: DashboardReadStateResponse;
  writeState: DashboardWriteStateResponse;
  readVaultIndex: DashboardReadVaultIndexResponse;
  readDocuments: DashboardReadDocumentsResponse;
};

export type DashboardApiErrorCode =
  | "invalid-request"
  | "permission-denied"
  | "resource-limit"
  | "state-invalid"
  | "unavailable";

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
