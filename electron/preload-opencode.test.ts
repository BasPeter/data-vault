import { describe, expect, it, vi } from "vitest";

const { invoke, on, removeListener, exposeInMainWorld } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  exposeInMainWorld: vi.fn(),
}));
vi.mock("electron", () => ({ contextBridge: { exposeInMainWorld }, ipcRenderer: { invoke, on, removeListener } }));

import { api } from "./preload";

describe("OpenCode preload API", () => {
  it("exposes only the typed OpenCode invokes and closed stream listener", () => {
    expect(
      Object.keys(api)
        .filter((name) => /OpenCode|openCode/.test(name))
        .sort(),
    ).toEqual(
      [
        "abortOpenCodePrompt",
        "acknowledgeOpenCodeStream",
        "createOpenCodeSession",
        "listOpenCodeMessages",
        "listOpenCodeSessions",
        "openCodeSetup",
        "openCodeStatus",
        "openCodeStreamReconciliationReady",
        "onOpenCodeStream",
        "removeOpenCodeSetup",
        "sendOpenCodePrompt",
        "startOpenCodeStream",
        "stopOpenCodeStream",
      ].sort(),
    );
    expect(exposeInMainWorld).toHaveBeenCalledWith("vaultApi", api);
  });

  it("uses fixed OpenCode channels and unregisters the stream listener", () => {
    void api.openCodeSetup({ port: 4096, username: "user", password: "password", disclosureAccepted: true });
    void api.removeOpenCodeSetup();
    void api.openCodeStatus();
    void api.openCodeStatus("session_1");
    void api.listOpenCodeSessions();
    void api.createOpenCodeSession("New chat");
    void api.listOpenCodeMessages("session_1");
    void api.sendOpenCodePrompt("session_1", "Hello");
    void api.abortOpenCodePrompt("session_1");
    void api.startOpenCodeStream();
    void api.stopOpenCodeStream();
    void api.acknowledgeOpenCodeStream(2, 3);
    void api.openCodeStreamReconciliationReady(2);
    const unsubscribe = api.onOpenCodeStream(vi.fn());
    unsubscribe();
    expect(invoke.mock.calls).toEqual([
      ["opencode:setup", expect.any(Object)],
      ["opencode:remove-setup"],
      ["opencode:status", undefined],
      ["opencode:status", "session_1"],
      ["opencode:list-sessions"],
      ["opencode:create-session", "New chat"],
      ["opencode:list-messages", "session_1"],
      ["opencode:send-prompt", "session_1", "Hello"],
      ["opencode:abort-prompt", "session_1"],
      ["opencode:stream:start"],
      ["opencode:stream:stop"],
      ["opencode:stream:acknowledge", 2, 3],
      ["opencode:stream:reconciliation-ready", 2],
    ]);
    expect(on).toHaveBeenCalledWith("opencode:stream:delivery", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("opencode:stream:delivery", expect.any(Function));
  });

  it("does not forward forged or cross-generation-shaped stream controls to the renderer", () => {
    const listener = vi.fn();
    api.onOpenCodeStream(listener);
    const handler = on.mock.calls.at(-1)?.[1] as (event: unknown, delivery: unknown) => void;
    handler({}, { kind: "control", generation: 0, sequence: 1, state: "connected" });
    handler({}, { kind: "control", generation: 2, sequence: 3, state: "invented" });
    handler(
      {},
      { kind: "delta", generation: 2, sequence: 4, sessionId: "session_1", messageId: "msg_1", text: "text" },
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      kind: "delta",
      generation: 2,
      sequence: 4,
      sessionId: "session_1",
      messageId: "msg_1",
      text: "text",
    });
  });
});
