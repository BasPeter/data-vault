import type { OpenCodeStreamCandidate, OpenCodeStreamContext } from "./opencode-stream-client";

type Frame = object;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_TEXT = 8_000;
const ACK_TIMEOUT_MS = 2_000;
const READY_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [250, 500, 1_000] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type OpenCodeStreamDelta = Readonly<{
  kind: "delta";
  generation: number;
  sequence: number;
  sessionId: string;
  messageId: string;
  text: string;
}>;
export type OpenCodeStreamControl = Readonly<{
  kind: "control";
  generation: number;
  sequence: number;
  state: "connected" | "reconnecting" | "terminal" | "polling-fallback" | "ready";
}>;
export type OpenCodeStreamDelivery = OpenCodeStreamDelta | OpenCodeStreamControl;

export type OpenCodeStreamRuntime = Readonly<{
  now: () => number;
  setTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}>;

export type OpenCodeStreamControllerDependencies = Readonly<{
  delivery: (frame: Frame, delivery: OpenCodeStreamDelivery) => void;
  stream: (
    context: OpenCodeStreamContext,
    onCandidate: (candidate: OpenCodeStreamCandidate) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  runtime?: OpenCodeStreamRuntime;
}>;

type Pending = Readonly<{ messageId: string; text: string }>;
type Awaiting = Readonly<{ generation: number; sequence: number; state: OpenCodeStreamControl["state"] | "delta" }>;
type Active = {
  generation: number;
  sequence: number;
  context: OpenCodeStreamContext;
  controller: AbortController;
  assistantId?: string;
  provisional: string;
  pending?: Pending;
  awaiting?: Awaiting;
  ackTimer?: ReturnType<typeof setTimeout>;
  readyTimer?: ReturnType<typeof setTimeout>;
  reconnectAcknowledged: boolean;
  ready: boolean;
  retries: number;
  retryTimer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_RUNTIME: OpenCodeStreamRuntime = { now: Date.now, setTimeout, clearTimeout };

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_SAFE;
}

/** Main-only stream correlation, bounded delivery, and renderer acknowledgement gate. */
export class OpenCodeStreamController {
  private readonly active = new Map<Frame, Active>();
  private readonly runtime: OpenCodeStreamRuntime;

  constructor(private readonly dependencies: OpenCodeStreamControllerDependencies) {
    this.runtime = dependencies.runtime ?? DEFAULT_RUNTIME;
  }

  start(frame: Frame, context: OpenCodeStreamContext): boolean {
    if (!validId(context.sessionId) || !validId(context.userMessageId)) return false;
    this.stop(frame);
    const active: Active = {
      generation: 1,
      sequence: 0,
      context,
      controller: new AbortController(),
      provisional: "",
      reconnectAcknowledged: false,
      ready: true,
      retries: 0,
    };
    this.active.set(frame, active);
    if (!this.control(frame, active, "connected", true)) {
      this.fallback(frame, active);
      return false;
    }
    this.open(frame, active);
    return true;
  }

  stop(frame: Frame): void {
    const active = this.active.get(frame);
    if (!active) return;
    this.clearTimers(active);
    active.controller.abort();
    this.active.delete(frame);
  }

  ack(frame: Frame, generation: unknown, sequence: unknown): boolean {
    const active = this.active.get(frame);
    if (!active || !validCounter(generation as number) || !validCounter(sequence as number)) return false;
    const awaiting = active.awaiting;
    if (!awaiting || awaiting.generation !== generation || awaiting.sequence !== sequence) return false;
    this.clearAck(active);
    active.awaiting = undefined;
    if (awaiting.state === "reconnecting") {
      active.reconnectAcknowledged = true;
      active.readyTimer = this.runtime.setTimeout(() => this.fallback(frame, active), READY_TIMEOUT_MS);
      return true;
    }
    if (awaiting.state === "terminal") {
      this.stop(frame);
      return true;
    }
    if (awaiting.state === "ready") active.ready = true;
    this.flush(frame, active);
    return true;
  }

  reconciliationReady(frame: Frame, generation: unknown): boolean {
    const active = this.active.get(frame);
    if (!active || generation !== active.generation || !active.reconnectAcknowledged || active.ready) return false;
    if (active.awaiting || !active.readyTimer) return false;
    this.runtime.clearTimeout(active.readyTimer);
    active.readyTimer = undefined;
    active.reconnectAcknowledged = false;
    return this.control(frame, active, "ready", true);
  }

  reconnect(frame: Frame): boolean {
    const active = this.active.get(frame);
    if (!active) return false;
    this.beginReconnect(frame, active);
    return this.active.get(frame) === active;
  }

  private open(frame: Frame, active: Active): void {
    const signal = active.controller.signal;
    void this.dependencies
      .stream(active.context, (candidate) => this.candidate(frame, active, candidate), signal)
      .then(
        () => {
          if (this.active.get(frame) === active && !signal.aborted) this.retry(frame, active);
        },
        () => {
          if (this.active.get(frame) === active && !signal.aborted) this.retry(frame, active);
        },
      );
  }

  private retry(frame: Frame, active: Active): void {
    if (active.retries >= RETRY_DELAYS_MS.length) {
      this.fallback(frame, active);
      return;
    }
    const delay = RETRY_DELAYS_MS[active.retries++];
    if (active.generation === 1) this.beginReconnect(frame, active);
    active.retryTimer = this.runtime.setTimeout(() => {
      if (this.active.get(frame) === active && !active.controller.signal.aborted) this.open(frame, active);
    }, delay);
  }

  private beginReconnect(frame: Frame, active: Active): void {
    this.clearAck(active);
    if (active.readyTimer) this.runtime.clearTimeout(active.readyTimer);
    active.readyTimer = undefined;
    active.generation = this.next(active.generation);
    active.provisional = "";
    active.pending = undefined;
    active.reconnectAcknowledged = false;
    active.ready = false;
    if (!this.control(frame, active, "reconnecting", true)) this.fallback(frame, active);
  }

  private candidate(frame: Frame, active: Active, candidate: OpenCodeStreamCandidate): void {
    if (this.active.get(frame) !== active || active.controller.signal.aborted) return;
    if (candidate.kind === "assistant-bound") {
      if (!active.assistantId) active.assistantId = candidate.messageId;
      return;
    }
    if (candidate.kind === "terminal") {
      this.clearAck(active);
      active.pending = undefined;
      active.provisional = "";
      this.control(frame, active, "terminal", true);
      return;
    }
    if (!active.assistantId || candidate.messageId !== active.assistantId || candidate.delta.length === 0) return;
    const text = active.provisional + candidate.delta;
    if (text.length > MAX_TEXT) {
      this.fallback(frame, active);
      return;
    }
    active.provisional = text;
    active.pending = { messageId: active.assistantId, text };
    this.flush(frame, active);
  }

  private flush(frame: Frame, active: Active): void {
    if (active.awaiting || !active.ready || !active.pending || this.active.get(frame) !== active) return;
    const pending = active.pending;
    active.pending = undefined;
    const delivery: OpenCodeStreamDelta = {
      kind: "delta",
      generation: active.generation,
      sequence: this.next(active.sequence),
      sessionId: active.context.sessionId,
      messageId: pending.messageId,
      text: pending.text,
    };
    active.sequence = delivery.sequence;
    this.send(frame, active, delivery, "delta", true);
  }

  private control(frame: Frame, active: Active, state: OpenCodeStreamControl["state"], acknowledged: boolean): boolean {
    const delivery: OpenCodeStreamControl = {
      kind: "control",
      generation: active.generation,
      sequence: this.next(active.sequence),
      state,
    };
    active.sequence = delivery.sequence;
    return this.send(frame, active, delivery, state, acknowledged);
  }

  private send(
    frame: Frame,
    active: Active,
    delivery: OpenCodeStreamDelivery,
    state: Awaiting["state"],
    acknowledged: boolean,
  ): boolean {
    try {
      this.dependencies.delivery(frame, delivery);
    } catch {
      return false;
    }
    if (acknowledged) {
      active.awaiting = { generation: delivery.generation, sequence: delivery.sequence, state };
      active.ackTimer = this.runtime.setTimeout(() => this.fallback(frame, active), ACK_TIMEOUT_MS);
    }
    return true;
  }

  private fallback(frame: Frame, active: Active): void {
    if (this.active.get(frame) !== active) return;
    this.clearTimers(active);
    active.controller.abort();
    const generation = this.next(active.generation);
    const sequence = this.next(active.sequence);
    this.active.delete(frame);
    try {
      this.dependencies.delivery(frame, { kind: "control", generation, sequence, state: "polling-fallback" });
    } catch {
      // Delivery has no authority after invalidation.
    }
  }

  private clearAck(active: Active): void {
    if (active.ackTimer) this.runtime.clearTimeout(active.ackTimer);
    active.ackTimer = undefined;
  }

  private clearTimers(active: Active): void {
    this.clearAck(active);
    if (active.readyTimer) this.runtime.clearTimeout(active.readyTimer);
    if (active.retryTimer) this.runtime.clearTimeout(active.retryTimer);
    active.readyTimer = undefined;
    active.retryTimer = undefined;
  }

  private next(value: number): number {
    return validCounter(value) && value < MAX_SAFE ? value + 1 : 1;
  }
}
