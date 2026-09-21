import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { OpenCodeClientError } from "./opencode-client";
import { OpenCodeController } from "./opencode-controller";

export const OPENCODE_IPC_CHANNELS = {
  setup: "opencode:setup",
  removeSetup: "opencode:remove-setup",
  status: "opencode:status",
  listSessions: "opencode:list-sessions",
  createSession: "opencode:create-session",
  listMessages: "opencode:list-messages",
  sendPrompt: "opencode:send-prompt",
  abortPrompt: "opencode:abort-prompt",
} as const;

export type OpenCodeIpcDependencies = Readonly<{
  ipcMain: Pick<IpcMain, "handle">;
  mainContents: () => WebContents | null;
  controller: OpenCodeController;
}>;

function frame(event: IpcMainInvokeEvent, mainContents: () => WebContents | null): object {
  const contents = mainContents();
  if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame) {
    throw new OpenCodeClientError();
  }
  return contents.mainFrame;
}

/** Registers the complete fixed OpenCode IPC surface. No other channel is accepted. */
export function registerOpenCodeIpc({ ipcMain, mainContents, controller }: OpenCodeIpcDependencies): void {
  ipcMain.handle(OPENCODE_IPC_CHANNELS.setup, async (event, input) =>
    controller.setup(frame(event, mainContents), input),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.removeSetup, async (event) =>
    controller.removeSetup(frame(event, mainContents)),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.status, async (event, id) => {
    const trustedFrame = frame(event, mainContents);
    return id === undefined ? controller.configurationStatus(trustedFrame) : controller.status(trustedFrame, id);
  });
  ipcMain.handle(OPENCODE_IPC_CHANNELS.listSessions, async (event) =>
    controller.listSessions(frame(event, mainContents)),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.createSession, async (event, title) =>
    controller.createSession(frame(event, mainContents), title),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.listMessages, async (event, id) =>
    controller.messages(frame(event, mainContents), id),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.sendPrompt, async (event, id, prompt) =>
    controller.sendPrompt(frame(event, mainContents), id, prompt),
  );
  ipcMain.handle(OPENCODE_IPC_CHANNELS.abortPrompt, async (event, id) =>
    controller.abort(frame(event, mainContents), id),
  );
}
