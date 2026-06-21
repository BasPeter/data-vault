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
  children: TreeNode[];
};

export type TreeNode = DocNode | FolderNode;
export type Manifest = { tree: TreeNode[] };

export type LoadedDoc = {
  id: string;
  title: string;
  meta: { title?: string; date?: string; tags?: string[] };
  html: string;
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
};

export type SyncResult = {
  ahead: number;
  behind: number;
  pulled: boolean;
};

export type VaultUpdate = {
  name?: string;
  remoteUrl?: string;
};

export type VaultUpdateResult = {
  vault: VaultSummary;
  push?: { ok: boolean; message?: string };
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
  list: () => Promise<VaultSummary[]>;
  chooseLocal: () => Promise<VaultSummary | null>;
  clone: (url: string) => Promise<VaultSummary>;
  createEmpty: (name: string) => Promise<VaultSummary>;
  updateVault: (vaultId: string, update: VaultUpdate) => Promise<VaultUpdateResult>;
  manifest: (vaultId: string) => Promise<Manifest>;
  document: (vaultId: string, documentId: string) => Promise<LoadedDoc>;
  quickNotes: (vaultId: string) => Promise<string>;
  saveQuickNotes: (vaultId: string, html: string) => Promise<void>;
  graph: (vaultId: string) => Promise<GraphData>;
  sync: (vaultId: string) => Promise<SyncResult>;
  updateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => () => void;
  skillStatus: () => Promise<SkillStatus>;
  installSkills: () => Promise<SkillStatus>;
};

declare global {
  interface Window {
    vaultApi: VaultApi;
  }
}
