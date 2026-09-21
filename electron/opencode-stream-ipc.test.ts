import { describe, expect, it, vi } from "vitest";
import { OpenCodeClientError } from "./opencode-client";
import { OPENCODE_STREAM_IPC_CHANNELS, OpenCodeStreamIpc } from "./opencode-stream-ipc";

function harness() {
  const handle = vi.fn();
  const sender = { mainFrame: {}, send: vi.fn() };
  const controller = { stop: vi.fn(), ack: vi.fn(() => true), reconciliationReady: vi.fn(() => true) };
  const bridge = new OpenCodeStreamIpc();
  bridge.register({ ipcMain: { handle }, mainContents: () => sender as never, controller });
  const invoke = (channel: string) =>
    handle.mock.calls.find(([registered]) => registered === channel)?.[1] as (...args: unknown[]) => unknown;
  const event = { sender, senderFrame: sender.mainFrame };
  return { bridge, controller, event, invoke, sender };
}

describe("OpenCode stream IPC", () => {
  it("registers only subscription and closed control channels", () => {
    const { invoke } = harness();
    expect(
      Object.values(OPENCODE_STREAM_IPC_CHANNELS).filter(
        (channel) => channel !== OPENCODE_STREAM_IPC_CHANNELS.delivery,
      ),
    ).toEqual([
      OPENCODE_STREAM_IPC_CHANNELS.start,
      OPENCODE_STREAM_IPC_CHANNELS.stop,
      OPENCODE_STREAM_IPC_CHANNELS.acknowledge,
      OPENCODE_STREAM_IPC_CHANNELS.reconciliationReady,
    ]);
    expect(invoke(OPENCODE_STREAM_IPC_CHANNELS.start)).toBeTypeOf("function");
  });

  it("accepts only the exact main frame for subscription, stop, ACK, and readiness", () => {
    const { controller, event, invoke } = harness();
    invoke(OPENCODE_STREAM_IPC_CHANNELS.start)(event);
    invoke(OPENCODE_STREAM_IPC_CHANNELS.acknowledge)(event, 2, 3);
    invoke(OPENCODE_STREAM_IPC_CHANNELS.reconciliationReady)(event, 2);
    invoke(OPENCODE_STREAM_IPC_CHANNELS.stop)(event);
    expect(controller.ack).toHaveBeenCalledWith(event.senderFrame, 2, 3);
    expect(controller.reconciliationReady).toHaveBeenCalledWith(event.senderFrame, 2);
    expect(controller.stop).toHaveBeenCalledWith(event.senderFrame);
    expect(() =>
      invoke(OPENCODE_STREAM_IPC_CHANNELS.acknowledge)({ sender: {}, senderFrame: event.senderFrame }, 2, 3),
    ).toThrow(OpenCodeClientError);
    expect(() =>
      invoke(OPENCODE_STREAM_IPC_CHANNELS.reconciliationReady)({ sender: event.sender, senderFrame: {} }, 2),
    ).toThrow(OpenCodeClientError);
  });

  it("forwards only a subscribed exact-frame closed delivery and cleans up after stop", () => {
    const { bridge, event, invoke, sender } = harness();
    const delivery = { kind: "control", generation: 1, sequence: 1, state: "connected" } as const;
    bridge.deliver(sender.mainFrame, delivery, () => sender as never);
    expect(sender.send).not.toHaveBeenCalled();
    invoke(OPENCODE_STREAM_IPC_CHANNELS.start)(event);
    bridge.deliver(sender.mainFrame, delivery, () => sender as never);
    expect(sender.send).toHaveBeenCalledWith(OPENCODE_STREAM_IPC_CHANNELS.delivery, delivery);
    invoke(OPENCODE_STREAM_IPC_CHANNELS.stop)(event);
    bridge.deliver(sender.mainFrame, delivery, () => sender as never);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed deliveries before they cross the bridge", () => {
    const { bridge, event, invoke, sender } = harness();
    invoke(OPENCODE_STREAM_IPC_CHANNELS.start)(event);
    bridge.deliver(
      sender.mainFrame,
      { kind: "control", generation: 0, sequence: 1, state: "connected" },
      () => sender as never,
    );
    bridge.deliver(
      sender.mainFrame,
      { kind: "delta", generation: 1, sequence: 2, sessionId: "session_1", messageId: "msg_1", text: "" },
      () => sender as never,
    );
    expect(sender.send).not.toHaveBeenCalled();
  });
});
