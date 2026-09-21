import { describe, expect, it, vi } from "vitest";
import { OpenCodeStreamController, type OpenCodeStreamRuntime } from "./opencode-stream-controller";
import type { OpenCodeStreamCandidate } from "./opencode-stream-client";

function clock(): { runtime: OpenCodeStreamRuntime; advance: (milliseconds: number) => void } {
  let now = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let next = 1;
  return {
    runtime: {
      now: () => now,
      setTimeout: (callback, milliseconds) => {
        const id = next++;
        timers.set(id, { at: now + milliseconds, callback });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (id) => timers.delete(id as unknown as number),
    },
    advance: (milliseconds) => {
      now += milliseconds;
      for (;;) {
        const due = [...timers.entries()].find(([, timer]) => timer.at <= now);
        if (!due) return;
        timers.delete(due[0]);
        due[1].callback();
      }
    },
  };
}

function harness() {
  const sent: unknown[] = [];
  let candidate!: (value: OpenCodeStreamCandidate) => void;
  const stream = vi.fn(async (_context, onCandidate: (value: OpenCodeStreamCandidate) => void) => {
    candidate = onCandidate;
  });
  const time = clock();
  const controller = new OpenCodeStreamController({
    delivery: (_frame, value) => sent.push(value),
    stream,
    runtime: time.runtime,
  });
  const frame = {};
  const start = () => controller.start(frame, { sessionId: "session_1", userMessageId: "msg_1" });
  return {
    candidate: (value: OpenCodeStreamCandidate) => candidate(value),
    controller,
    frame,
    sent,
    start,
    stream,
    time,
  };
}

describe("OpenCodeStreamController", () => {
  it("delivers only closed correlated snapshots with one ACK gate and one coalesced pending delta", async () => {
    const test = harness();
    test.start();
    expect(test.sent).toEqual([{ kind: "control", generation: 1, sequence: 1, state: "connected" }]);
    expect(test.controller.ack(test.frame, 1, 1)).toBe(true);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "one" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: " two" });
    expect(test.sent).toEqual([
      { kind: "control", generation: 1, sequence: 1, state: "connected" },
      { kind: "delta", generation: 1, sequence: 2, sessionId: "session_1", messageId: "assistant_1", text: "one" },
    ]);
    expect(test.controller.ack(test.frame, 1, 2)).toBe(true);
    expect(test.sent.at(-1)).toEqual({
      kind: "delta",
      generation: 1,
      sequence: 3,
      sessionId: "session_1",
      messageId: "assistant_1",
      text: "one two",
    });
  });

  it("rejects stale or duplicate ACKs and falls back atomically on the two-second ACK timeout", () => {
    const test = harness();
    test.start();
    expect(test.controller.ack(test.frame, 1, 2)).toBe(false);
    expect(test.controller.ack(test.frame, 1, 1)).toBe(true);
    expect(test.controller.ack(test.frame, 1, 1)).toBe(false);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "one" });
    test.time.advance(2_000);
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 2, sequence: 3, state: "polling-fallback" });
    expect(test.controller.ack(test.frame, 1, 2)).toBe(false);
  });

  it("never truncates a provisional snapshot and falls back when it would exceed 8,000 code units", () => {
    const test = harness();
    test.start();
    test.controller.ack(test.frame, 1, 1);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "x".repeat(8_000) });
    expect(test.sent.at(-1)).toMatchObject({ kind: "delta", text: "x".repeat(8_000) });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "x" });
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 2, sequence: 3, state: "polling-fallback" });
  });

  it("clears provisional state, requires reconnect ACK then readiness, and accepts a slow ten-second reconciliation", () => {
    const test = harness();
    test.start();
    test.controller.ack(test.frame, 1, 1);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "one" });
    expect(test.controller.reconnect(test.frame)).toBe(true);
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 2, sequence: 3, state: "reconnecting" });
    expect(test.controller.reconciliationReady(test.frame, 2)).toBe(false);
    expect(test.controller.ack(test.frame, 2, 3)).toBe(true);
    test.time.advance(10_000);
    expect(test.controller.reconciliationReady(test.frame, 2)).toBe(true);
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 2, sequence: 4, state: "ready" });
    expect(test.controller.ack(test.frame, 2, 4)).toBe(true);
    expect(test.controller.reconciliationReady(test.frame, 2)).toBe(false);
  });

  it("closes only for a relevant terminal candidate and invalidates on stop", () => {
    const test = harness();
    test.start();
    test.controller.ack(test.frame, 1, 1);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "other_1", delta: "ignored" });
    expect(test.sent).toHaveLength(1);
    test.candidate({ kind: "terminal" });
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 1, sequence: 2, state: "terminal" });
    expect(test.controller.ack(test.frame, 1, 2)).toBe(true);
    test.controller.stop(test.frame);
    expect(test.controller.ack(test.frame, 1, 2)).toBe(false);
  });

  it("rejects stale readiness and falls back when a reconnected generation is not ready within fifteen seconds", () => {
    const test = harness();
    test.start();
    test.controller.ack(test.frame, 1, 1);
    test.controller.reconnect(test.frame);
    expect(test.controller.reconciliationReady(test.frame, 1)).toBe(false);
    test.controller.ack(test.frame, 2, 2);
    test.time.advance(15_000);
    expect(test.sent.at(-1)).toEqual({ kind: "control", generation: 3, sequence: 3, state: "polling-fallback" });
  });

  it("allows at most a delayed old batch and a new fallback control across invalidation", () => {
    const test = harness();
    test.start();
    test.controller.ack(test.frame, 1, 1);
    test.candidate({ kind: "assistant-bound", messageId: "assistant_1" });
    test.candidate({ kind: "text-delta", messageId: "assistant_1", delta: "old" });
    test.time.advance(2_000);
    expect(test.sent.slice(-2)).toEqual([
      { kind: "delta", generation: 1, sequence: 2, sessionId: "session_1", messageId: "assistant_1", text: "old" },
      { kind: "control", generation: 2, sequence: 3, state: "polling-fallback" },
    ]);
  });
});
