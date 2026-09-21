import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { OpenCodeClientError } from "./opencode-client";
import type { OpenCodeStreamDelivery } from "./opencode-stream-controller";

type Frame = object;

export const OPENCODE_STREAM_IPC_CHANNELS = {
  start: "opencode:stream:start",
  stop: "opencode:stream:stop",
  acknowledge: "opencode:stream:acknowledge",
  reconciliationReady: "opencode:stream:reconciliation-ready",
  delivery: "opencode:stream:delivery",
} as const;

export type OpenCodeStreamControls = Readonly<{
  stop: (frame: Frame) => void;
  ack: (frame: Frame, generation: unknown, sequence: unknown) => boolean;
  reconciliationReady: (frame: Frame, generation: unknown) => boolean;
}>;

export type OpenCodeStreamIpcDependencies = Readonly<{
  ipcMain: Pick<IpcMain, "handle">;
  mainContents: () => WebContents | null;
  controller: OpenCodeStreamControls;
}>;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function validCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function validDelivery(value: OpenCodeStreamDelivery): boolean {
  if (!validCounter(value.generation) || !validCounter(value.sequence)) return false;
  if (value.kind === "delta") {
    return (
      ID_PATTERN.test(value.sessionId) &&
      ID_PATTERN.test(value.messageId) &&
      value.text.length >= 1 &&
      value.text.length <= 8_000
    );
  }
  return ["connected", "reconnecting", "terminal", "polling-fallback", "ready"].includes(value.state);
}

function trustedFrame(event: IpcMainInvokeEvent, mainContents: () => WebContents | null): Frame {
  const contents = mainContents();
  if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
    throw new OpenCodeClientError();
  return contents.mainFrame;
}

/** Closed stream control bridge. Renderer registration never accepts correlation identifiers. */
export class OpenCodeStreamIpc {
  private readonly subscriptions = new Set<Frame>();

  register({ ipcMain, mainContents, controller }: OpenCodeStreamIpcDependencies): void {
    ipcMain.handle(OPENCODE_STREAM_IPC_CHANNELS.start, (event) => {
      this.subscriptions.add(trustedFrame(event, mainContents));
    });
    ipcMain.handle(OPENCODE_STREAM_IPC_CHANNELS.stop, (event) => {
      const frame = trustedFrame(event, mainContents);
      this.subscriptions.delete(frame);
      controller.stop(frame);
    });
    ipcMain.handle(OPENCODE_STREAM_IPC_CHANNELS.acknowledge, (event, generation, sequence) =>
      controller.ack(trustedFrame(event, mainContents), generation, sequence),
    );
    ipcMain.handle(OPENCODE_STREAM_IPC_CHANNELS.reconciliationReady, (event, generation) =>
      controller.reconciliationReady(trustedFrame(event, mainContents), generation),
    );
  }

  deliver(frame: Frame, delivery: OpenCodeStreamDelivery, mainContents: () => WebContents | null): void {
    const contents = mainContents();
    if (!contents || contents.mainFrame !== frame || !this.subscriptions.has(frame) || !validDelivery(delivery)) return;
    contents.send(OPENCODE_STREAM_IPC_CHANNELS.delivery, delivery);
  }
}
