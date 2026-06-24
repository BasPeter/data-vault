import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Github, Lock, Plus, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { GitHubAccount, GitHubDeviceFlowStart, GitHubRepo, GitHubStatus } from "@/types";

type GithubConnectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (preferred?: string) => Promise<void>;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function GithubConnectDialog({ open, onOpenChange, onDone }: GithubConnectDialogProps) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [flow, setFlow] = useState<GitHubDeviceFlowStart | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = status?.accounts ?? [];

  // Refresh the connection status whenever the dialog opens, and subscribe to
  // device-flow / status broadcasts pushed from the main process.
  useEffect(() => {
    if (!open) return;
    let active = true;
    void window.vaultApi.githubStatus().then((next) => {
      if (active) setStatus(next);
    });
    const offStatus = window.vaultApi.onGithubStatus((next) => setStatus(next));
    const offFlow = window.vaultApi.onGithubDeviceFlow((event) => {
      if (event.state === "connected") {
        setFlow(null); // status broadcast adds the new account
        return;
      }
      setFlow(null);
      setError(event.message ?? "GitHub sign-in failed. Try again.");
    });
    return () => {
      active = false;
      offStatus();
      offFlow();
    };
  }, [open]);

  const connect = async () => {
    setError(null);
    setCopied(false);
    setBusy(true);
    try {
      setFlow(await window.vaultApi.startDeviceFlow());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancelFlow = () => {
    void window.vaultApi.cancelDeviceFlow();
    setFlow(null);
    setError(null);
    setCopied(false);
  };

  const disconnect = async (login: string) => {
    setError(null);
    setBusy(true);
    try {
      setStatus(await window.vaultApi.disconnectGithub(login));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!flow) return;
    try {
      await navigator.clipboard.writeText(flow.userCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const close = () => {
    if (busy) return;
    if (flow) void window.vaultApi.cancelDeviceFlow();
    onOpenChange(false);
  };

  const connecting = flow !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            Connect to GitHub
          </DialogTitle>
          <DialogDescription>
            {accounts.length > 0 && !connecting
              ? "Choose a repository to open, or create a new one. You can connect more than one account."
              : "Sign in once to clone and create repositories without setting up Git on your machine."}
          </DialogDescription>
        </DialogHeader>

        {status && !status.configured && (
          <p role="alert" className="text-destructive text-sm">
            GitHub sign-in isn’t configured in this build. Use the advanced URL option to clone by Git URL instead.
          </p>
        )}

        {connecting && flow ? (
          <DeviceCodePanel flow={flow} copied={copied} onCopy={copyCode} onCancel={cancelFlow} />
        ) : status?.configured ? (
          accounts.length === 0 ? (
            <Button onClick={connect} disabled={busy}>
              <Github />
              {busy ? "Starting…" : "Connect to GitHub"}
            </Button>
          ) : (
            <ConnectedView
              accounts={accounts}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onDone={onDone}
              onClose={() => onOpenChange(false)}
              onDisconnect={disconnect}
              onAddAccount={connect}
            />
          )
        ) : null}

        {status && !status.secure && accounts.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Your GitHub tokens are stored without operating-system encryption on this device.
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive text-sm whitespace-pre-wrap">
            {error}
          </p>
        )}

        {!connecting && (
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeviceCodePanel({
  flow,
  copied,
  onCopy,
  onCancel,
}: {
  flow: GitHubDeviceFlowStart;
  copied: boolean;
  onCopy: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Enter this code on GitHub to finish signing in. This window updates automatically once you approve.
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-muted flex-1 rounded-md px-3 py-2 text-center font-mono text-lg tracking-[0.3em]">
          {flow.userCode}
        </code>
        <Button variant="outline" size="icon" onClick={onCopy} title="Copy code">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <Button asChild>
        <a href={flow.verificationUri} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open GitHub to authorize
        </a>
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function ConnectedView({
  accounts,
  busy,
  setBusy,
  setError,
  onDone,
  onClose,
  onDisconnect,
  onAddAccount,
}: {
  accounts: GitHubAccount[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string | null) => void;
  onDone: (preferred?: string) => Promise<void>;
  onClose: () => void;
  onDisconnect: (login: string) => void;
  onAddAccount: () => void;
}) {
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [newName, setNewName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [createAccount, setCreateAccount] = useState(accounts[0]?.login ?? "");
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);

  const loadRepos = async () => {
    setError(null);
    try {
      setRepos(await window.vaultApi.listGithubRepos());
    } catch (cause) {
      setError(errorMessage(cause));
      setRepos([]);
    }
  };

  useEffect(() => {
    void loadRepos();
    // Reload whenever the set of connected accounts changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map((account) => account.login).join(",")]);

  // Keep the create-account selection valid as accounts connect/disconnect.
  useEffect(() => {
    if (!accounts.some((account) => account.login === createAccount)) {
      setCreateAccount(accounts[0]?.login ?? "");
    }
  }, [accounts, createAccount]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!repos) return [];
    if (!needle) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));
  }, [repos, filter]);

  const cloneRepo = async (repo: GitHubRepo) => {
    setError(null);
    setBusy(true);
    setCloningRepo(repo.fullName);
    try {
      const vault = await window.vaultApi.cloneGithubRepo(repo.fullName, repo.account);
      await onDone(vault.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setCloningRepo(null);
    }
  };

  const createRepo = async () => {
    setError(null);
    setBusy(true);
    try {
      const vault = await window.vaultApi.createGithubRepoAndClone({
        name: newName.trim(),
        private: isPrivate,
        account: createAccount,
      });
      await onDone(vault.id);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {accounts.map((account) => (
          <div key={account.login} className="flex items-center gap-2">
            {account.avatarUrl && <img src={account.avatarUrl} alt="" className="size-6 rounded-full" />}
            <span className="text-sm font-medium">@{account.login}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              title={`Disconnect @${account.login}`}
              onClick={() => onDisconnect(account.login)}
              disabled={busy}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button variant="link" size="sm" className="h-auto justify-start p-0" onClick={onAddAccount} disabled={busy}>
          <UserPlus />
          Add another account
        </Button>
      </div>

      <div className="flex gap-1">
        <Button
          variant={mode === "pick" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1"
          onClick={() => setMode("pick")}
        >
          Open a repository
        </Button>
        <Button
          variant={mode === "create" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1"
          onClick={() => setMode("create")}
        >
          <Plus />
          Create new
        </Button>
      </div>

      {mode === "pick" ? (
        <>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search your repositories"
              className="pl-8"
            />
          </div>
          <div className="max-h-64 min-h-32 overflow-x-hidden overflow-y-auto rounded-md border">
            {repos === null ? (
              <p className="text-muted-foreground p-4 text-sm">Loading repositories…</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-4">
                <p className="text-muted-foreground text-sm">No repositories found.</p>
                <Button variant="outline" size="sm" onClick={loadRepos} disabled={busy}>
                  <RefreshCw />
                  Refresh
                </Button>
              </div>
            ) : (
              filtered.map((repo) => (
                <button
                  key={`${repo.account}/${repo.fullName}`}
                  type="button"
                  disabled={busy}
                  onClick={() => cloneRepo(repo)}
                  className="hover:bg-accent flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium">{repo.fullName}</span>
                      {repo.private && <Lock className="text-muted-foreground size-3 shrink-0" />}
                    </div>
                    {repo.description && <p className="text-muted-foreground truncate text-xs">{repo.description}</p>}
                  </div>
                  {accounts.length > 1 && (
                    <span className="text-muted-foreground bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
                      @{repo.account}
                    </span>
                  )}
                  {cloningRepo === repo.fullName && <RefreshCw className="size-4 shrink-0 animate-spin" />}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="new-repo-account">
                Account
              </label>
              <select
                id="new-repo-account"
                value={createAccount}
                onChange={(event) => setCreateAccount(event.target.value)}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                {accounts.map((account) => (
                  <option key={account.login} value={account.login}>
                    @{account.login}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="new-repo-name">
              Repository name
            </label>
            <Input
              id="new-repo-name"
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newName.trim() && !busy) void createRepo();
              }}
              placeholder="my-vault"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              className="size-4 rounded border"
            />
            Private repository
          </label>
          <Button onClick={createRepo} disabled={busy || !newName.trim() || !createAccount}>
            <Plus />
            {busy ? "Creating…" : "Create and open"}
          </Button>
        </div>
      )}
    </div>
  );
}
