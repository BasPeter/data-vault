export type DocNode = {
  type: "doc";
  id: string;
  label: string;
  date: string | null;
  tags: string[];
};

export type FolderNode = {
  type: "folder";
  id: string;
  label: string;
  description?: string;
  children: TreeNode[];
};

export type DirectoryMeta = {
  title?: string;
  description?: string;
  children?: Record<string, DirectoryMeta>;
};

export type VaultStructure = Record<string, DirectoryMeta>;
export type VaultFormat = "html" | "markdown";

export type TreeNode = DocNode | FolderNode;
export type Manifest = { tree: TreeNode[] };

export type LoadedDoc = {
  id: string;
  title: string;
  meta: { title?: string; date?: string; tags?: string[] };
  format: VaultFormat;
  source: string;
  html: string;
  sourceStartLine: number;
};

export type BlameLine = {
  lineNumber: number;
  content: string;
  author: string;
  timestamp: string | null;
  summary: string;
  commit: string | null;
};

export type GraphNode = {
  id: string;
  label: string;
  folder: string;
  tags: string[];
  degree: number;
};

export type GraphLink = { source: string; target: string };
export type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

export type VaultSummary = {
  id: string;
  name: string;
  repositoryPath: string;
  hasConfig?: boolean;
  remoteUrl?: string;
  // Login of the GitHub account whose token clones/syncs this vault. App-local
  // (kept in the registry, not vault.json), set when cloned or created.
  githubAccount?: string;
  format: VaultFormat;
  defaultLanguage?: string;
  structure?: VaultStructure;
};

export type SyncResult = {
  ahead: number;
  behind: number;
  pulled: boolean;
};

export type VaultChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted";

export type VaultChange = {
  path: string;
  previousPath?: string;
  kind: VaultChangeKind;
};

export type VaultChangeStatus = {
  changed: boolean;
  changes: VaultChange[];
};

export type VaultUpdate = {
  name?: string;
  remoteUrl?: string;
  format?: VaultFormat;
  defaultLanguage?: string;
  structure?: VaultStructure;
};

export type VaultUpdateResult = {
  vault: VaultSummary;
  push?: { ok: boolean; message?: string };
};

export type SavePdfResult = {
  saved: boolean;
  filePath?: string;
};

export type DocumentOpenRequest = {
  vaultId: string;
  documentId: string;
};

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "installing" | "not-available" | "error";
  currentVersion: string;
  version?: string;
  percent?: number;
  latestReleaseNotes?: string;
  message?: string;
};

export type AppChangelogCommit = {
  hash: string;
  shortHash: string;
  subject: string;
};

export type AppChangelogRelease = {
  version: string;
  date: string;
  commits: AppChangelogCommit[];
};

export type AppChangelog = {
  generatedAt: string;
  repositoryUrl?: string;
  releases: AppChangelogRelease[];
};

export type AgentSkillVersionStatus = {
  name: string;
  label: string;
  latestVersion: string;
  installedVersion: string | null;
  state: "not-installed" | "outdated" | "current";
};

export type SkillStatus = {
  state: "not-installed" | "outdated" | "current";
  version: string;
  vaultCount: number;
  skills: AgentSkillVersionStatus[];
};

export type GitHubAccount = {
  login: string;
  avatarUrl?: string;
};

export type GitHubStatus = {
  configured: boolean;
  secure: boolean;
  accounts: GitHubAccount[];
};

export type GitHubRepo = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  cloneUrl: string;
  description: string | null;
  updatedAt: string;
  // Login of the connected account this repository was listed through; identifies
  // which token to use when cloning it.
  account: string;
};

export type GitHubDeviceFlowStart = {
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
};

export type GitHubDeviceFlowEvent = {
  state: "pending" | "connected" | "expired" | "denied" | "error";
  message?: string;
};

export type CreateRepoInput = {
  name: string;
  private: boolean;
  account: string;
};

export type VaultApi = {
  platform: NodeJS.Platform;
  list: () => Promise<VaultSummary[]>;
  chooseLocal: () => Promise<VaultSummary | null>;
  clone: (url: string) => Promise<VaultSummary>;
  createEmpty: (name: string, format?: VaultFormat) => Promise<VaultSummary>;
  updateVault: (vaultId: string, update: VaultUpdate) => Promise<VaultUpdateResult>;
  removeVault: (vaultId: string) => Promise<void>;
  manifest: (vaultId: string) => Promise<Manifest>;
  document: (vaultId: string, documentId: string) => Promise<LoadedDoc>;
  documentPath: (vaultId: string, documentId: string) => Promise<string>;
  saveDocumentPdf: (vaultId: string, documentId: string) => Promise<SavePdfResult>;
  watch: (vaultId: string) => Promise<void>;
  blame: (vaultId: string, documentId: string) => Promise<BlameLine[]>;
  quickNotes: (vaultId: string) => Promise<string>;
  saveQuickNotes: (vaultId: string, html: string) => Promise<void>;
  graph: (vaultId: string) => Promise<GraphData>;
  changes: (vaultId: string) => Promise<VaultChangeStatus>;
  sync: (vaultId: string) => Promise<SyncResult>;
  updateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  changelog: () => Promise<AppChangelog>;
  securityAssessmentPrompt: (version?: string) => Promise<string>;
  setTitleBarTheme: (theme: "light" | "dark") => Promise<void>;
  pendingOpenDocument: () => Promise<DocumentOpenRequest | null>;
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => () => void;
  onVaultChanged: (listener: (vaultId: string) => void) => () => void;
  onOpenDocument: (listener: (request: DocumentOpenRequest) => void) => () => void;
  skillStatus: () => Promise<SkillStatus>;
  installSkills: () => Promise<SkillStatus>;
  githubStatus: () => Promise<GitHubStatus>;
  startDeviceFlow: () => Promise<GitHubDeviceFlowStart>;
  cancelDeviceFlow: () => Promise<void>;
  disconnectGithub: (login: string) => Promise<GitHubStatus>;
  listGithubRepos: () => Promise<GitHubRepo[]>;
  cloneGithubRepo: (fullName: string, account: string) => Promise<VaultSummary>;
  createGithubRepoAndClone: (input: CreateRepoInput) => Promise<VaultSummary>;
  onGithubStatus: (listener: (status: GitHubStatus) => void) => () => void;
  onGithubDeviceFlow: (listener: (event: GitHubDeviceFlowEvent) => void) => () => void;
};

declare global {
  interface Window {
    vaultApi: VaultApi;
  }
}
