import { describe, expect, it, vi } from "vitest";
import type { OpenCodeMessage, OpenCodeSession, OpenCodeStatus } from "./opencode-client";
import { OpenCodeClientError } from "./opencode-client";
import { OpenCodeController, type OpenCodeConfigurationStatus } from "./opencode-controller";

const session: OpenCodeSession = { id: "session_1", title: "New chat", createdAt: "2026-08-12T12:00:00.000Z" };
const message: OpenCodeMessage = {
  id: "message_1",
  role: "assistant",
  text: "Hello",
  createdAt: "2026-08-12T12:00:00.000Z",
};
const status: OpenCodeStatus = { state: "idle" };

function dependencies() {
  const client = {
    createSession: vi.fn(async () => session),
    status: vi.fn<(id: unknown, signal?: AbortSignal) => Promise<OpenCodeStatus>>(async () => status),
    messages: vi.fn(async () => [message]),
    sendPrompt: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const setup = vi.fn(async () => undefined);
  const remove = vi.fn();
  return { client, setup, remove };
}

describe("OpenCodeController", () => {
  it("creates a trusted message ID and starts streaming only after the accepted prompt and compatibility gate", async () => {
    const deps = dependencies();
    const streamController = { start: vi.fn(), stop: vi.fn() };
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
      messageId: () => "msg_trusted_1",
      streamingSupported: () => true,
      streamController: streamController as never,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame);
    await controller.sendPrompt(frame, session.id, "hello");
    expect(deps.client.sendPrompt).toHaveBeenCalledWith(session.id, "hello", "msg_trusted_1", expect.any(AbortSignal));
    expect(streamController.start).toHaveBeenCalledWith(frame, {
      sessionId: session.id,
      userMessageId: "msg_trusted_1",
    });

    deps.client.sendPrompt.mockRejectedValueOnce(new Error("not accepted"));
    await expect(controller.sendPrompt(frame, session.id, "again")).rejects.toThrow("OpenCode request failed.");
    expect(streamController.start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["authentication-failed", "OpenCode rejected these credentials"],
    ["incompatible", "OpenCode version is incompatible"],
    ["unavailable", "OpenCode is unavailable"],
  ] as const)("preserves the known %s setup code without remote details", async (code, message) => {
    const deps = dependencies();
    const secret = "remote credential detail";
    deps.setup.mockRejectedValueOnce(new OpenCodeClientError(secret, code));
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });

    await expect(
      controller.setup({}, { port: 4096, username: "user", password: "password", disclosureAccepted: true }),
    ).rejects.toMatchObject({ code, message: expect.stringContaining(message) });
    expect(
      await controller.setup({}, { port: 4096, username: "user", password: "password", disclosureAccepted: true }),
    ).toBeUndefined();
  });

  it.each(["authentication-failed", "incompatible", "unavailable"] as const)(
    "maps a known configuration health error to %s",
    async (code) => {
      const deps = dependencies();
      const controller = new OpenCodeController({
        setup: deps.setup,
        removeSetup: deps.remove,
        client: () => deps.client,
        configuration: async () => {
          throw new OpenCodeClientError("remote credential detail", code);
        },
      });

      await expect(controller.configurationStatus({})).resolves.toEqual({ state: code });
    },
  );
  it("grants only a successful create result to its current frame and configuration", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};

    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await expect(controller.createSession(frame, "New chat")).resolves.toEqual(session);
    expect(controller.listSessions(frame)).toEqual([session]);
    await expect(controller.messages(frame, session.id)).resolves.toEqual([message]);
    expect(deps.client.messages).toHaveBeenCalledWith(session.id, expect.any(AbortSignal));
    deps.client.status.mockResolvedValueOnce({ state: "busy" });
    await expect(controller.status(frame, session.id)).resolves.toEqual({ state: "busy" });
    await expect(controller.abort(frame, session.id)).resolves.toBeUndefined();
    expect(deps.client.abort).toHaveBeenCalledWith(session.id, expect.any(AbortSignal));

    controller.invalidate(frame);
    await expect(controller.messages(frame, session.id)).rejects.toThrow("OpenCode request failed.");
    expect(deps.client.messages).toHaveBeenCalledOnce();
  });

  it("does not grant a failed create, or let another frame use a granted ID", async () => {
    const deps = dependencies();
    deps.client.createSession.mockRejectedValueOnce(new Error("remote detail"));
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const owner = {};
    const other = {};
    await controller.setup(owner, { port: 4096, username: "user", password: "password", disclosureAccepted: true });

    await expect(controller.createSession(owner, "")).rejects.toThrow("OpenCode request failed.");
    await expect(controller.status(other, session.id)).rejects.toThrow("OpenCode request failed.");
    expect(deps.client.status).not.toHaveBeenCalled();
  });

  it("enforces argument, result, session, and frame concurrency bounds before a request", async () => {
    const deps = dependencies();
    let release!: () => void;
    deps.client.status.mockImplementation(
      () =>
        new Promise<OpenCodeStatus>((resolve) => {
          release = () => resolve(status);
        }),
    );
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");

    const pending = controller.status(frame, session.id);
    await expect(controller.status(frame, session.id)).rejects.toThrow("OpenCode request failed.");
    await expect(controller.sendPrompt(frame, session.id, "x".repeat(8001))).rejects.toThrow(
      "OpenCode request failed.",
    );
    release();
    await expect(pending).resolves.toEqual(status);
  });

  it("cancels and rejects stale operations after configuration replacement without disturbing the new generation", async () => {
    const deps = dependencies();
    let release!: () => void;
    let signal: AbortSignal | undefined;
    deps.client.status.mockImplementation(
      (_id, requestSignal) =>
        new Promise<OpenCodeStatus>((resolve) => {
          signal = requestSignal;
          release = () => resolve(status);
        }),
    );
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");
    const pending = controller.status(frame, session.id);

    await controller.setup(frame, { port: 4097, username: "user", password: "password", disclosureAccepted: true });
    expect(signal?.aborted).toBe(true);
    release();
    await expect(pending).rejects.toThrow("OpenCode request failed.");
    await expect(controller.status(frame, session.id)).rejects.toThrow("OpenCode request failed.");
  });

  it("enforces session and transcript count bounds without exposing malformed remote results", async () => {
    const deps = dependencies();
    let count = 0;
    deps.client.createSession.mockImplementation(async () => ({ ...session, id: `session_${++count}` }));
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    for (let index = 0; index < 20; index += 1) await controller.createSession(frame, "");
    await expect(controller.createSession(frame, "")).rejects.toThrow("OpenCode request failed.");
    deps.client.messages.mockResolvedValueOnce(Array.from({ length: 101 }, () => message));
    await expect(controller.messages(frame, "session_1")).rejects.toThrow("OpenCode request failed.");
  });

  it("preserves the fixed oversized-transcript error without exposing remote details", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");
    deps.client.messages.mockRejectedValueOnce(
      new OpenCodeClientError("body=private Authorization: Basic private", "transcript-too-large"),
    );

    const error = await controller.messages(frame, session.id).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(OpenCodeClientError);
    expect((error as OpenCodeClientError).code).toBe("transcript-too-large");
    expect(String(error)).toBe("OpenCodeClientError: OpenCode transcript is too large to display.");
    expect(String(error)).not.toContain("private");
    expect(String(error)).not.toContain("Authorization");
  });

  it("rejects every malformed IPC argument before setup or remote operations, while accepting each maximum", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    const valid = { port: 65535, username: "u".repeat(256), password: "p".repeat(1024), disclosureAccepted: true };
    for (const input of [
      null,
      { ...valid, port: 0 },
      { ...valid, port: 65536 },
      { ...valid, port: 1.5 },
      { ...valid, username: "" },
      { ...valid, username: "u".repeat(257) },
      { ...valid, password: "" },
      { ...valid, password: "p".repeat(1025) },
      { ...valid, disclosureAccepted: false },
    ]) {
      await expect(controller.setup(frame, input)).rejects.toThrow("OpenCode request failed.");
    }
    expect(deps.setup).not.toHaveBeenCalled();
    await expect(controller.setup(frame, valid)).resolves.toBeUndefined();
    await expect(controller.createSession(frame, "t".repeat(120))).resolves.toEqual(session);
    for (const title of [null, "t".repeat(121)]) {
      await expect(controller.createSession(frame, title)).rejects.toThrow("OpenCode request failed.");
    }
    for (const operation of [
      () => controller.status(frame, ""),
      () => controller.messages(frame, "x".repeat(129)),
      () => controller.sendPrompt(frame, "id/with/slash", "prompt"),
      () => controller.abort(frame, "id/with/slash"),
      () => controller.sendPrompt(frame, session.id, ""),
      () => controller.sendPrompt(frame, session.id, "p".repeat(8001)),
    ]) {
      await expect(operation()).rejects.toThrow("OpenCode request failed.");
    }
    await expect(controller.sendPrompt(frame, session.id, "p".repeat(8000))).resolves.toBeUndefined();
    expect(controller.listSessions(frame)).toEqual([session]);
    expect(() => controller.removeSetup(frame)).not.toThrow();
  });

  it("permits a new prompt after a successful owned abort clears busy state", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");
    deps.client.status.mockResolvedValueOnce({ state: "busy" });
    await expect(controller.status(frame, session.id)).resolves.toEqual({ state: "busy" });
    await expect(controller.sendPrompt(frame, session.id, "new work")).rejects.toThrow("OpenCode request failed.");
    await expect(controller.abort(frame, session.id)).resolves.toBeUndefined();
    await expect(controller.sendPrompt(frame, session.id, "new work")).resolves.toBeUndefined();
    expect(deps.client.sendPrompt).toHaveBeenCalledWith(
      session.id,
      "new work",
      expect.stringMatching(/^msg_[A-Za-z0-9_-]{1,128}$/),
      expect.any(AbortSignal),
    );
    expect(deps.client.abort).toHaveBeenCalledOnce();
  });

  it("retains busy state when an abort fails or becomes stale", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");
    deps.client.status.mockResolvedValueOnce({ state: "busy" });
    await controller.status(frame, session.id);

    deps.client.abort.mockRejectedValueOnce(new Error("remote failure"));
    await expect(controller.abort(frame, session.id)).rejects.toThrow("OpenCode request failed.");
    await expect(controller.sendPrompt(frame, session.id, "new work")).rejects.toThrow("OpenCode request failed.");

    let release!: (value: undefined) => void;
    deps.client.abort.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          release = resolve;
        }),
    );
    const staleAbort = controller.abort(frame, session.id);
    await controller.setup(frame, { port: 4097, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(frame, "");
    deps.client.status.mockResolvedValueOnce({ state: "busy" });
    await controller.status(frame, session.id);
    release(undefined);
    await expect(staleAbort).rejects.toThrow("OpenCode request failed.");
    await expect(controller.sendPrompt(frame, session.id, "new work")).rejects.toThrow("OpenCode request failed.");
  });

  it("rejects aborts for unowned and stale sessions before the remote abort route", async () => {
    const deps = dependencies();
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const owner = {};
    const other = {};
    await controller.setup(owner, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    await controller.createSession(owner, "");
    await expect(controller.abort(other, session.id)).rejects.toThrow("OpenCode request failed.");
    controller.invalidate(owner);
    await expect(controller.abort(owner, session.id)).rejects.toThrow("OpenCode request failed.");
    expect(deps.client.abort).not.toHaveBeenCalled();
  });

  it("enforces four in-flight requests per frame and one per session, then releases both locks", async () => {
    const deps = dependencies();
    let sessionNumber = 0;
    const releases: Array<() => void> = [];
    deps.client.createSession.mockImplementation(async () => ({ ...session, id: `session_${++sessionNumber}` }));
    deps.client.status.mockImplementation(
      () =>
        new Promise<OpenCodeStatus>((resolve) => {
          releases.push(() => resolve(status));
        }),
    );
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
    });
    const frame = {};
    await controller.setup(frame, { port: 4096, username: "user", password: "password", disclosureAccepted: true });
    const sessions: OpenCodeSession[] = [];
    for (let index = 0; index < 5; index += 1) sessions.push(await controller.createSession(frame, ""));
    const pending = sessions.slice(0, 4).map((entry) => controller.status(frame, entry.id));
    await expect(controller.status(frame, sessions[0].id)).rejects.toThrow("OpenCode request failed.");
    await expect(controller.status(frame, sessions[4].id)).rejects.toThrow("OpenCode request failed.");
    for (const release of releases.splice(0)) release();
    await expect(Promise.all(pending)).resolves.toEqual([status, status, status, status]);
    deps.client.status.mockResolvedValueOnce(status);
    await expect(controller.status(frame, sessions[4].id)).resolves.toEqual(status);
  });

  it("returns only bounded configuration states without exposing credentials and restores a ready client", async () => {
    const deps = dependencies();
    const credentials = { port: 4096, username: "user", password: "password" };
    const configuration = vi.fn<() => Promise<OpenCodeConfigurationStatus & { credentials?: typeof credentials }>>(
      async () => ({
        state: "ready",
        credentials,
      }),
    );
    const controller = new OpenCodeController({
      setup: deps.setup,
      removeSetup: deps.remove,
      client: () => deps.client,
      configuration,
    });
    const frame = {};
    await expect(controller.configurationStatus(frame)).resolves.toEqual({ state: "ready" });
    expect(await controller.createSession(frame, "")).toEqual(session);
    expect(JSON.stringify(await controller.configurationStatus(frame))).not.toContain("password");
    for (const state of [
      "unconfigured",
      "unavailable",
      "incompatible",
      "authentication-failed",
      "secure-storage-unavailable",
    ] as const) {
      configuration.mockResolvedValueOnce({ state });
      await expect(controller.configurationStatus({})).resolves.toEqual({ state });
    }
  });
});
