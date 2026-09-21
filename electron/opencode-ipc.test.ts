import { describe, expect, it, vi } from "vitest";
import { OpenCodeController } from "./opencode-controller";
import { OpenCodeClientError } from "./opencode-client";
import { OPENCODE_IPC_CHANNELS, registerOpenCodeIpc } from "./opencode-ipc";

function controller() {
  return new OpenCodeController({
    setup: vi.fn(async () => undefined),
    removeSetup: vi.fn(),
    client: () => ({
      createSession: vi.fn(),
      status: vi.fn(),
      messages: vi.fn(),
      sendPrompt: vi.fn(),
      abort: vi.fn(),
    }),
  });
}

describe("OpenCode IPC", () => {
  it("registers exactly the eight typed methods", () => {
    const handle = vi.fn();
    registerOpenCodeIpc({ ipcMain: { handle }, mainContents: () => null, controller: controller() });
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual(Object.values(OPENCODE_IPC_CHANNELS));
  });

  it("accepts only the exact main window sender and main frame", async () => {
    const handle = vi.fn();
    const sender = { mainFrame: {} };
    const controls = controller();
    registerOpenCodeIpc({
      ipcMain: { handle },
      mainContents: () => sender as never,
      controller: controls,
    });
    const status = handle.mock.calls.find(([channel]) => channel === OPENCODE_IPC_CHANNELS.status)?.[1] as (
      event: unknown,
      id?: unknown,
    ) => Promise<unknown>;
    const listSessions = handle.mock.calls.find(([channel]) => channel === OPENCODE_IPC_CHANNELS.listSessions)?.[1] as (
      event: unknown,
    ) => Promise<unknown>;
    // A successful fixed operation proves both exact identity checks passed.
    await expect(listSessions({ sender, senderFrame: sender.mainFrame })).resolves.toEqual([]);
    await expect(status({ sender, senderFrame: sender.mainFrame })).resolves.toEqual({ state: "unconfigured" });
    await expect(status({ sender, senderFrame: sender.mainFrame }, "session_1")).rejects.toThrow(
      "OpenCode request failed.",
    );
    await expect(status({ sender: {}, senderFrame: sender.mainFrame }, "session_1")).rejects.toThrow(
      "OpenCode request failed.",
    );
    await expect(status({ sender, senderFrame: {} }, "session_1")).rejects.toThrow("OpenCode request failed.");
  });

  it("rejects setup with fixed actionable known error guidance", async () => {
    const handle = vi.fn();
    const sender = { mainFrame: {} };
    const controls = new OpenCodeController({
      setup: async () => {
        throw new OpenCodeClientError("password=private-password", "authentication-failed");
      },
      removeSetup: vi.fn(),
      client: () => ({
        createSession: vi.fn(),
        status: vi.fn(),
        messages: vi.fn(),
        sendPrompt: vi.fn(),
        abort: vi.fn(),
      }),
    });
    registerOpenCodeIpc({ ipcMain: { handle }, mainContents: () => sender as never, controller: controls });
    const setup = handle.mock.calls.find(([channel]) => channel === OPENCODE_IPC_CHANNELS.setup)?.[1] as (
      event: unknown,
      input: unknown,
    ) => Promise<unknown>;

    await expect(
      setup(
        { sender, senderFrame: sender.mainFrame },
        { port: 4096, username: "opencode", password: "private-password", disclosureAccepted: true },
      ),
    ).rejects.toMatchObject({
      code: "authentication-failed",
      message: "OpenCode rejected these credentials. Check the username and password.",
    });
  });
});
