import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, CircleStop, MessageCircle, Plus, RefreshCw, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OpenCodeConfigurationStatus, OpenCodeMessage, OpenCodeSession, OpenCodeStatus } from "@/types";

const POLL_INTERVAL_MS = 1_000;
const POLL_LIMIT_MS = 120_000;
const POLL_FAILURE_LIMIT = 3;
const TRANSCRIPT_TOO_LARGE = "OpenCode transcript is too large to display.";
const ERROR_MESSAGES = new Set(["OpenCode request failed.", TRANSCRIPT_TOO_LARGE]);
const SETUP_ERROR_MESSAGES = new Set([
  "OpenCode is unavailable. Start it separately, then try again.",
  "This OpenCode version is incompatible. Update OpenCode, then try again.",
  "OpenCode rejected these credentials. Check the username and password.",
]);

function errorMessage(cause: unknown): string {
  return cause instanceof Error && ERROR_MESSAGES.has(cause.message)
    ? cause.message
    : "OpenCode is unavailable. Check its setup and try again.";
}

function setupErrorMessage(cause: unknown): string {
  return cause instanceof Error && SETUP_ERROR_MESSAGES.has(cause.message)
    ? cause.message
    : "OpenCode is unavailable. Start it separately, then try again.";
}

function configurationMessage(state: OpenCodeConfigurationStatus["state"]): string | null {
  switch (state) {
    case "ready":
      return null;
    case "unconfigured":
      return "OpenCode is not configured. Enter its local setup details below.";
    case "unavailable":
      return "OpenCode is unavailable. Start it separately, then try again.";
    case "incompatible":
      return "This OpenCode version is incompatible. Update OpenCode, then try again.";
    case "authentication-failed":
      return "OpenCode rejected these credentials. Check the username and password.";
    case "secure-storage-unavailable":
      return "Secure credential storage is unavailable on this device.";
  }
}

function isSessionStatus(status: OpenCodeStatus | OpenCodeConfigurationStatus): status is OpenCodeStatus {
  return status.state === "busy" || status.state === "idle";
}

/** Native, typed-IPC-only UI for sessions this renderer creates during its lifetime. */
export function OpenCodeChatPopover() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [port, setPort] = useState("4096");
  const [username, setUsername] = useState("opencode");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [prompt, setPrompt] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pollGenerationRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const refreshCountRef = useRef(0);
  const mountedRef = useRef(true);
  const openRef = useRef(false);
  const operationGenerationRef = useRef(0);

  const clearCredentials = useCallback(() => {
    setUsername("opencode");
    setPassword("");
  }, []);

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const invalidateOperations = useCallback(() => {
    operationGenerationRef.current += 1;
  }, []);

  const refreshMessages = useCallback(async (id: string) => {
    const next = await window.vaultApi.listOpenCodeMessages(id);
    setMessages(next);
  }, []);

  const refreshSelected = useCallback(async (id: string) => {
    const generation = pollGenerationRef.current;
    refreshCountRef.current += 1;
    setRefreshing(true);
    try {
      const status = await window.vaultApi.openCodeStatus(id);
      if (!isSessionStatus(status)) throw new Error("OpenCode session is unavailable.");
      if (generation !== pollGenerationRef.current) return undefined;
      setBusy(status.state === "busy");
      const next = await window.vaultApi.listOpenCodeMessages(id);
      if (generation !== pollGenerationRef.current) return undefined;
      setMessages(next);
      return status.state;
    } finally {
      refreshCountRef.current -= 1;
      if (refreshCountRef.current === 0) setRefreshing(false);
    }
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      const generation = pollGenerationRef.current;
      let failures = 0;
      const started = Date.now();
      const poll = async () => {
        if (generation !== pollGenerationRef.current || Date.now() - started >= POLL_LIMIT_MS) return;
        try {
          const state = await refreshSelected(id);
          if (generation !== pollGenerationRef.current) return;
          failures = 0;
          if (state === "idle") {
            stopPolling();
            return;
          }
        } catch (cause) {
          if (generation !== pollGenerationRef.current) return;
          failures += 1;
          if (failures >= POLL_FAILURE_LIMIT) {
            setBusy(false);
            setError(errorMessage(cause));
            stopPolling();
            return;
          }
        }
        if (generation === pollGenerationRef.current) {
          pollTimerRef.current = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
      };
      // The first refresh is deliberately deferred: prompts are asynchronous,
      // and polling is a fixed one-second cadence rather than a stream.
      pollTimerRef.current = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    },
    [refreshSelected, stopPolling],
  );

  const loadSessions = useCallback(async () => {
    try {
      const next = await window.vaultApi.listOpenCodeSessions();
      setSessions(next.slice(0, 20));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  const refreshConfiguration = useCallback(async () => {
    try {
      const status = await window.vaultApi.openCodeStatus();
      if (isSessionStatus(status)) throw new Error("OpenCode configuration is unavailable.");
      const message = configurationMessage(status.state);
      setConfigured(status.state === "ready");
      setError(message);
      setShowSetup(status.state !== "ready");
    } catch (cause) {
      setConfigured(false);
      setError(errorMessage(cause));
      setShowSetup(true);
    }
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      void refreshConfiguration();
      void loadSessions();
    } else {
      invalidateOperations();
      stopPolling();
      setSelectedId(null);
      setMessages([]);
      setPrompt("");
      setBusy(false);
      setSending(false);
      setError(null);
      setShowSetup(false);
      clearCredentials();
    }
  }, [clearCredentials, invalidateOperations, loadSessions, open, refreshConfiguration, stopPolling]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      invalidateOperations();
      stopPolling();
      clearCredentials();
    },
    [clearCredentials, invalidateOperations, stopPolling],
  );

  const selectSession = async (id: string) => {
    stopPolling();
    setSelectedId(id);
    setError(null);
    try {
      await refreshSelected(id);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const createSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const session = await window.vaultApi.createOpenCodeSession("New chat");
      setConfigured(true);
      setSessions((current) => [...current, session].slice(0, 20));
      await selectSession(session.id);
    } catch (cause) {
      setError(errorMessage(cause));
      setShowSetup(true);
    } finally {
      setCreating(false);
    }
  };

  const saveSetup = async () => {
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535 || !username || !password || !accepted) {
      setError("Enter a port, username, password, and accept the disclosure.");
      return;
    }
    setSavingSetup(true);
    setError(null);
    invalidateOperations();
    stopPolling();
    try {
      await window.vaultApi.openCodeSetup({ port: parsedPort, username, password, disclosureAccepted: true });
      setSessions([]);
      setSelectedId(null);
      setMessages([]);
      await refreshConfiguration();
    } catch (cause) {
      setError(setupErrorMessage(cause));
    } finally {
      // The bridge receives the values only for this active setup call. Do not
      // retain either credential in renderer state after it settles.
      clearCredentials();
      setSavingSetup(false);
    }
  };

  const sendPrompt = async () => {
    if (!selectedId || !prompt.trim() || busy || sending || refreshing) return;
    const text = prompt.trim();
    const operationGeneration = operationGenerationRef.current;
    const active = () =>
      mountedRef.current && openRef.current && operationGeneration === operationGenerationRef.current;
    setSending(true);
    setBusy(true);
    setError(null);
    try {
      await window.vaultApi.sendOpenCodePrompt(selectedId, text);
      if (!active()) return;
      setPrompt("");
      startPolling(selectedId);
    } catch (cause) {
      if (!active()) return;
      setBusy(false);
      setError(errorMessage(cause));
    } finally {
      if (active()) setSending(false);
    }
  };

  const abort = async () => {
    if (!selectedId || !busy || refreshing) return;
    setSending(true);
    stopPolling();
    try {
      await window.vaultApi.abortOpenCodePrompt(selectedId);
      setBusy(false);
      await refreshMessages(selectedId);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) invalidateOperations();
        openRef.current = nextOpen;
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          className="fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg"
          size="icon"
          aria-label="Open OpenCode chat"
          title="Open OpenCode chat"
        >
          <MessageCircle />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="flex h-[min(640px,calc(100vh-5rem))] w-[min(480px,calc(100vw-2rem))] flex-col p-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b pb-2">
          <Bot className="size-4" />
          <h2 className="flex-1 text-sm font-semibold">OpenCode chat</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowSetup((value) => !value)} aria-expanded={showSetup}>
            <Settings2 /> Setup
          </Button>
        </div>
        {error && (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {error}
          </p>
        )}
        {showSetup && (
          <section className="mt-2 rounded-md border p-3 text-xs" aria-label="OpenCode setup">
            <p className="leading-relaxed">
              OpenCode runs separately with your OS authority. It may execute commands, read local files and provider
              credentials, and use the network. Data Vault does not start or control it and provides no vault context or
              application privilege.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Input aria-label="OpenCode port" value={port} onChange={(event) => setPort(event.target.value)} />
              <Input
                aria-label="OpenCode username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <Input
                aria-label="OpenCode password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <label className="mt-3 flex gap-2">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> I
              understand and accept this authority.
            </label>
            <Button className="mt-3" size="sm" onClick={() => void saveSetup()} disabled={savingSetup}>
              {savingSetup ? "Saving..." : "Save setup"}
            </Button>
          </section>
        )}
        <div className="mt-3 flex min-h-0 flex-1 gap-3 overflow-hidden">
          <aside className="w-28 shrink-0 overflow-auto border-r pr-2">
            <Button
              className="w-full"
              size="sm"
              onClick={() => void createSession()}
              disabled={creating || refreshing || sending}
            >
              <Plus /> New
            </Button>
            <div className="mt-2 grid gap-1">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="rounded px-2 py-1 text-left text-xs hover:bg-muted"
                  aria-pressed={selectedId === session.id}
                  onClick={() => void selectSession(session.id)}
                  disabled={refreshing || sending}
                >
                  {session.title || "Untitled chat"}
                </button>
              ))}
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            {selectedId ? (
              <div className="min-h-0 flex-1 overflow-auto" aria-label="Chat transcript">
                {messages.map((message) => (
                  <p key={message.id} className="mb-2 break-words text-sm">
                    <span className="font-medium">{message.role === "user" ? "You" : "OpenCode"}:</span> {message.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Create a new chat to begin. Only chats created in this app window are available here.
              </p>
            )}
            {selectedId && (
              <div className="mt-2 flex gap-2 border-t pt-2">
                <Input
                  aria-label="Message OpenCode"
                  value={prompt}
                  maxLength={8000}
                  disabled={busy || sending || refreshing}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void sendPrompt();
                    }
                  }}
                />
                <Button
                  size="icon"
                  aria-label="Send message"
                  onClick={() => void sendPrompt()}
                  disabled={!prompt.trim() || busy || sending || refreshing}
                >
                  <Send />
                </Button>
                {busy && (
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Abort prompt"
                    onClick={() => void abort()}
                    disabled={sending || refreshing}
                  >
                    <CircleStop />
                  </Button>
                )}
              </div>
            )}
            {configured && selectedId && (
              <Button
                className="mt-2 self-start"
                size="sm"
                variant="ghost"
                onClick={() => void selectSession(selectedId)}
                disabled={refreshing || sending}
              >
                <RefreshCw /> Refresh
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
