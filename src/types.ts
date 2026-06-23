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

export type TreeNode = DocNode | FolderNode;
export type Manifest = { tree: TreeNode[] };

export type LoadedDoc = {
  id: string;
  title: string;
  meta: { title?: string; date?: string; tags?: string[] };
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
  remoteUrl?: string;
  defaultLanguage?: string;
  structure?: VaultStructure;
};

export type SyncResult = {
  ahead: number;
  behind: number;
  pulled: boolean;
};

export type VaultUpdate = {
  name?: string;
  remoteUrl?: string;
  defaultLanguage?: string;
  structure?: VaultStructure;
};

export type VaultUpdateResult = {
  vault: VaultSummary;
  push?: { ok: boolean; message?: string };
};

export type GitHubStatus = {
  authenticated: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
  scopes?: string[];
};

export type GitHubLoginStart = {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
};

export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string | null;
  description: string | null;
  updatedAt: string;
};

export type GitHubCreateRepoInput = {
  name: string;
  private: boolean;
  description?: string;
};

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error";
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

export type SkillStatus = {
  state: "not-installed" | "outdated" | "current";
  version: string;
  vaultCount: number;
};

export type VaultApi = {
  platform: NodeJS.Platform;
  list: () => Promise<VaultSummary[]>;
  resetVaults: () => Promise<VaultSummary[]>;
  chooseLocal: () => Promise<VaultSummary | null>;
  clone: (url: string) => Promise<VaultSummary>;
  createEmpty: (name: string) => Promise<VaultSummary>;
  cloneGitHubRepo: (fullName: string) => Promise<VaultSummary>;
  createGitHubVault: (input: GitHubCreateRepoInput) => Promise<VaultSummary>;
  updateVault: (vaultId: string, update: VaultUpdate) => Promise<VaultUpdateResult>;
  manifest: (vaultId: string) => Promise<Manifest>;
  document: (vaultId: string, documentId: string) => Promise<LoadedDoc>;
  blame: (vaultId: string, documentId: string) => Promise<BlameLine[]>;
  quickNotes: (vaultId: string) => Promise<string>;
  saveQuickNotes: (vaultId: string, html: string) => Promise<void>;
  graph: (vaultId: string) => Promise<GraphData>;
  sync: (vaultId: string) => Promise<SyncResult>;
  updateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  setTitleBarTheme: (theme: "light" | "dark") => Promise<void>;
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => () => void;
  skillStatus: () => Promise<SkillStatus>;
  installSkills: () => Promise<SkillStatus>;
  githubStatus: () => Promise<GitHubStatus>;
  githubLoginStart: () => Promise<GitHubLoginStart>;
  githubLoginComplete: () => Promise<GitHubStatus>;
  githubLogout: () => Promise<GitHubStatus>;
  githubRepos: () => Promise<GitHubRepo[]>;
};

declare global {
  interface Window {
    vaultApi: VaultApi;
  }
}
