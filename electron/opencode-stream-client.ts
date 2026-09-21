import { OpenCodeClientError, type OpenCodeCredentials, validateOpenCodePort } from "./opencode-client";

export const OPENCODE_EVENT_HEADER_TIMEOUT_MS = 10_000;
export const OPENCODE_EVENT_INACTIVITY_TIMEOUT_MS = 45_000;
export const OPENCODE_EVENT_MAX_LINE_BYTES = 16_384;
export const OPENCODE_EVENT_MAX_BYTES = 32_768;
export const OPENCODE_EVENT_MAX_BUFFER_BYTES = 65_536;
export const OPENCODE_EVENT_ROLLING_BYTES = 512 * 1024;
export const OPENCODE_EVENT_ROLLING_EVENTS = 200;
export const OPENCODE_EVENT_ROLLING_WINDOW_MS = 10_000;

export type OpenCodeStreamContext = Readonly<{ sessionId: string; userMessageId: string }>;
export type OpenCodeStreamCandidate =
  | Readonly<{ kind: "assistant-bound"; messageId: string }>
  | Readonly<{ kind: "text-delta"; messageId: string; delta: string }>
  | Readonly<{ kind: "terminal" }>;

export type OpenCodeStreamRuntime = Readonly<{
  now: () => number;
  setTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
}>;

type ParserOptions = Readonly<{ now?: () => number; signal?: AbortSignal }>;
type EventFields = { name?: string; data: string[]; bytes: number };
type RollingInput = { at: number; bytes: number; events: number };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_RUNTIME: OpenCodeStreamRuntime = { now: Date.now, setTimeout, clearTimeout };

function failed(): never {
  throw new OpenCodeClientError();
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function hasSafeNesting(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.every((entry) => hasSafeNesting(entry, depth + 1));
  const nested = record(value);
  return !nested || Object.values(nested).every((entry) => hasSafeNesting(entry, depth + 1));
}

function parseData(fields: EventFields): unknown {
  if (fields.data.length === 0) failed();
  try {
    const parsed: unknown = JSON.parse(fields.data.join("\n"));
    if (!hasSafeNesting(parsed)) failed();
    return parsed;
  } catch (error) {
    if (error instanceof OpenCodeClientError) throw error;
    failed();
  }
}

function supportedCandidate(
  fields: EventFields,
  context: OpenCodeStreamContext,
  boundAssistantId: string | undefined,
): { candidate?: OpenCodeStreamCandidate; boundAssistantId?: string; terminal: boolean } {
  if (!fields.name) {
    if (fields.data.length > 0) failed();
    return { terminal: false };
  }
  if (
    fields.name !== "message.updated" &&
    fields.name !== "message.part.delta" &&
    fields.name !== "session.status" &&
    fields.name !== "session.idle"
  ) {
    return { terminal: false };
  }
  const data = record(parseData(fields));
  if (!data || !validId(data.sessionID)) failed();

  switch (fields.name) {
    case "message.updated": {
      const info = record(data.info);
      if (!info || !validId(info.id) || !validId(info.parentID) || (info.role !== "user" && info.role !== "assistant"))
        failed();
      if (
        data.sessionID !== context.sessionId ||
        info.role !== "assistant" ||
        info.parentID !== context.userMessageId
      ) {
        return { terminal: false };
      }
      if (boundAssistantId && boundAssistantId !== info.id) return { terminal: false };
      return { candidate: { kind: "assistant-bound", messageId: info.id }, boundAssistantId: info.id, terminal: false };
    }
    case "message.part.delta": {
      if (!validId(data.messageID) || !validId(data.partID) || data.field !== "text" || !validText(data.delta, 0, 8000))
        failed();
      if (data.sessionID !== context.sessionId || data.messageID !== boundAssistantId) return { terminal: false };
      return { candidate: { kind: "text-delta", messageId: data.messageID, delta: data.delta }, terminal: false };
    }
    case "session.status": {
      const status = record(data.status);
      if (!status || typeof status.type !== "string") failed();
      if (data.sessionID !== context.sessionId || status.type !== "idle") return { terminal: false };
      return { candidate: { kind: "terminal" }, terminal: true };
    }
    case "session.idle":
      if (data.sessionID !== context.sessionId) return { terminal: false };
      return { candidate: { kind: "terminal" }, terminal: true };
  }
}

/** Parses untrusted SSE into correlation candidates; raw event data never leaves this module. */
export async function parseOpenCodeEventStream(
  body: ReadableStream<Uint8Array>,
  context: OpenCodeStreamContext,
  onCandidate: (candidate: OpenCodeStreamCandidate) => void,
  { now = Date.now, signal }: ParserOptions = {},
): Promise<void> {
  if (!validId(context.sessionId) || !validId(context.userMessageId)) failed();
  const reader = body.getReader();
  let line: number[] = [];
  let event: EventFields = { data: [], bytes: 0 };
  let boundAssistantId: string | undefined;
  const rolling: RollingInput[] = [];
  let rollingBytes = 0;
  let rollingEvents = 0;
  let aborted = signal?.aborted === true;
  const cancel = () => {
    aborted = true;
    void reader.cancel();
  };
  signal?.addEventListener("abort", cancel, { once: true });

  const account = (bytes: number, events: number) => {
    const current = now();
    while (rolling.length > 0 && rolling[0]!.at <= current - OPENCODE_EVENT_ROLLING_WINDOW_MS) {
      const expired = rolling.shift()!;
      rollingBytes -= expired.bytes;
      rollingEvents -= expired.events;
    }
    rolling.push({ at: current, bytes, events });
    rollingBytes += bytes;
    rollingEvents += events;
    if (rollingBytes > OPENCODE_EVENT_ROLLING_BYTES || rollingEvents > OPENCODE_EVENT_ROLLING_EVENTS) failed();
  };

  const consumeLine = () => {
    if (line.length > OPENCODE_EVENT_MAX_LINE_BYTES) failed();
    const raw = Uint8Array.from(line);
    line = [];
    const content = raw.length > 0 && raw[raw.length - 1] === 13 ? raw.subarray(0, -1) : raw;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(content);
    } catch {
      failed();
    }
    if (text === "") {
      account(0, 1);
      if (event.bytes === 0) return false;
      const result = supportedCandidate(event, context, boundAssistantId);
      event = { data: [], bytes: 0 };
      if (result.boundAssistantId) boundAssistantId = result.boundAssistantId;
      if (result.candidate) onCandidate(result.candidate);
      return result.terminal;
    }
    if (event.bytes + raw.length + 1 > OPENCODE_EVENT_MAX_BYTES) failed();
    event.bytes += raw.length + 1;
    if (text.startsWith(":")) return false;
    const separator = text.indexOf(":");
    if (separator < 1) failed();
    const field = text.slice(0, separator);
    const value = text.slice(separator + 1).replace(/^ /, "");
    if (field === "event") {
      if (event.name !== undefined || !validText(value, 1, 128)) failed();
      event.name = value;
    } else if (field === "data") {
      event.data.push(value);
    } else {
      failed();
    }
    return false;
  };

  try {
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done || aborted) break;
      if (!value) continue;
      account(value.byteLength, 0);
      for (const byte of value) {
        if (byte === 10) {
          if (consumeLine()) return;
        } else {
          line.push(byte);
          if (line.length > OPENCODE_EVENT_MAX_LINE_BYTES || line.length > OPENCODE_EVENT_MAX_BUFFER_BYTES) failed();
        }
      }
    }
    if (!aborted && line.length > 0) consumeLine();
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
}

export class OpenCodeEventStreamClient {
  private readonly origin: string;
  private readonly authorization: string;

  constructor(
    credentials: OpenCodeCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly runtime: OpenCodeStreamRuntime = DEFAULT_RUNTIME,
  ) {
    const port = validateOpenCodePort(credentials.port);
    if (!validText(credentials.username, 1, 256) || !validText(credentials.password, 1, 1024)) failed();
    this.origin = `http://127.0.0.1:${port}`;
    this.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64")}`;
  }

  async stream(
    context: OpenCodeStreamContext,
    onCandidate: (candidate: OpenCodeStreamCandidate) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return;
    const controller = new AbortController();
    let externalAbort = false;
    const abort = () => {
      externalAbort = true;
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    let headerTimer: ReturnType<typeof setTimeout> | undefined = this.runtime.setTimeout(
      () => controller.abort(),
      OPENCODE_EVENT_HEADER_TIMEOUT_MS,
    );
    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
    const resetInactivity = () => {
      if (inactivityTimer) this.runtime.clearTimeout(inactivityTimer);
      inactivityTimer = this.runtime.setTimeout(() => controller.abort(), OPENCODE_EVENT_INACTIVITY_TIMEOUT_MS);
    };
    try {
      const response = await this.fetchImpl(`${this.origin}/event`, {
        method: "GET",
        headers: { authorization: this.authorization },
        redirect: "error",
        signal: controller.signal,
      });
      if (headerTimer) this.runtime.clearTimeout(headerTimer);
      headerTimer = undefined;
      if (
        response.status !== 200 ||
        !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") ||
        !response.body
      ) {
        failed();
      }
      resetInactivity();
      await parseOpenCodeEventStream(
        response.body,
        context,
        (candidate) => {
          resetInactivity();
          onCandidate(candidate);
        },
        { now: this.runtime.now, signal: controller.signal },
      );
    } catch (error) {
      if (!externalAbort) {
        if (error instanceof OpenCodeClientError) throw error;
        failed();
      }
    } finally {
      if (headerTimer) this.runtime.clearTimeout(headerTimer);
      if (inactivityTimer) this.runtime.clearTimeout(inactivityTimer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
