import { describe, expect, it, vi } from "vitest";
import { OpenCodeClientError } from "./opencode-client";
import {
  OpenCodeEventStreamClient,
  parseOpenCodeEventStream,
  type OpenCodeStreamRuntime,
} from "./opencode-stream-client";

const credentials = { port: 4096, username: "user", password: "password" };
const context = { sessionId: "session_1", userMessageId: "user_1" };
const encoder = new TextEncoder();

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function runtime(): {
  runtime: OpenCodeStreamRuntime;
  advance: (ms: number) => void;
  timers: ReturnType<typeof vi.fn>;
} {
  let now = 0;
  const timers = vi.fn<(callback: () => void, ms: number) => ReturnType<typeof setTimeout>>();
  const scheduled = new Map<number, { callback: () => void; at: number }>();
  let next = 1;
  timers.mockImplementation((callback, ms) => {
    const id = next++;
    scheduled.set(id, { callback, at: now + ms });
    return id as unknown as ReturnType<typeof setTimeout>;
  });
  return {
    runtime: {
      now: () => now,
      setTimeout: timers,
      clearTimeout: (id) => scheduled.delete(id as unknown as number),
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...scheduled]) {
        if (timer.at <= now) {
          scheduled.delete(id);
          timer.callback();
        }
      }
    },
    timers,
  };
}

describe("OpenCode bounded event parser", () => {
  it("counts raw chunks before decoding and parses split UTF-8, CRLF/LF, comments, and multiline data", async () => {
    const candidates: unknown[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const text = `: keepalive\r\nevent: message.updated\r\ndata: {"sessionID":"session_1","info":{"id":"assistant_1","role":"assistant","parentID":"user_1"}}\r\n\r\n`;
        const delta = "é";
        const prefix = `event: message.part.delta\ndata: {"sessionID":"session_1",\ndata: "messageID":"assistant_1","partID":"part_1","field":"text","delta":"${delta}"}\n\n`;
        const bytes = encoder.encode(text + prefix);
        const splitAt = bytes.indexOf(0xc3) + 1;
        controller.enqueue(bytes.subarray(0, splitAt));
        controller.enqueue(bytes.subarray(splitAt));
        controller.close();
      },
    });
    await parseOpenCodeEventStream(body, context, (candidate) => candidates.push(candidate));
    expect(candidates).toEqual([
      { kind: "assistant-bound", messageId: "assistant_1" },
      { kind: "text-delta", messageId: "assistant_1", delta: "é" },
    ]);
  });

  it("ignores well-formed unknown and correlation-mismatched input but includes it in rolling budgets", async () => {
    const candidates: unknown[] = [];
    await parseOpenCodeEventStream(
      stream(
        event("unknown.event", { private: "ignored" }),
        event("message.updated", {
          sessionID: "session_1",
          info: { id: "other_1", role: "assistant", parentID: "different_1" },
        }),
        event("message.part.delta", {
          sessionID: "session_1",
          messageID: "other_1",
          partID: "part_1",
          field: "text",
          delta: "ignored",
        }),
      ),
      context,
      (candidate) => candidates.push(candidate),
    );
    expect(candidates).toEqual([]);
    await expect(
      parseOpenCodeEventStream(stream(": x\n\n".repeat(201)), context, vi.fn(), {
        now: () => 0,
      }),
    ).rejects.toBeInstanceOf(OpenCodeClientError);
  });

  it("fails closed for invalid UTF-8, malformed supported payloads, raw fields, excessive nesting, and hard bounds", async () => {
    const invalidUtf8 = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0x0a]));
        controller.close();
      },
    });
    const nested: unknown[] = [];
    let cursor = nested;
    for (let index = 0; index < 9; index += 1) {
      const child: unknown[] = [];
      cursor.push(child);
      cursor = child;
    }
    for (const body of [
      invalidUtf8,
      stream(event("message.updated", { sessionID: "session_1", info: { id: "x", role: "assistant" } })),
      stream("id: raw\n\n"),
      stream(event("message.part.delta", nested)),
      stream(`data: ${"x".repeat(16_385)}\n`),
      stream(`data: ${"x".repeat(32_769)}\n\n`),
      stream("x".repeat(65_537)),
      stream("x".repeat(512 * 1024 + 1)),
    ]) {
      await expect(parseOpenCodeEventStream(body, context, vi.fn())).rejects.toBeInstanceOf(OpenCodeClientError);
    }
  });

  it("returns terminal only for the active session and closes without processing later input", async () => {
    const candidates: unknown[] = [];
    await parseOpenCodeEventStream(
      stream(
        event("session.status", { sessionID: "other_1", status: { type: "idle" } }),
        event("session.idle", { sessionID: "session_1" }),
        event("message.updated", {
          sessionID: "session_1",
          info: { id: "assistant_1", role: "assistant", parentID: "user_1" },
        }),
      ),
      context,
      (candidate) => candidates.push(candidate),
    );
    expect(candidates).toEqual([{ kind: "terminal" }]);
  });
});

describe("OpenCode event stream client", () => {
  it("uses the fixed authenticated GET /event request and rejects redirects, status, and media type", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(stream(), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } }),
    );
    await new OpenCodeEventStreamClient(credentials, fetchImpl).stream(context, vi.fn());
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:4096/event", {
      method: "GET",
      headers: { authorization: `Basic ${Buffer.from("user:password").toString("base64")}` },
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    for (const response of [
      new Response(null, { status: 204, headers: { "content-type": "text/event-stream" } }),
      new Response(null, { status: 200, headers: { "content-type": "application/json" } }),
    ]) {
      await expect(
        new OpenCodeEventStreamClient(
          credentials,
          vi.fn(async () => response),
        ).stream(context, vi.fn()),
      ).rejects.toBeInstanceOf(OpenCodeClientError);
    }
  });

  it("clears the ten-second header timer once headers are accepted and resets the separate inactivity timer only for candidates", async () => {
    const clock = runtime();
    const client = new OpenCodeEventStreamClient(
      credentials,
      vi.fn(
        async () =>
          new Response(
            stream(
              event("unknown.event", { ignored: true }),
              event("message.updated", {
                sessionID: "session_1",
                info: { id: "assistant_1", role: "assistant", parentID: "user_1" },
              }),
            ),
            { headers: { "content-type": "text/event-stream" } },
          ),
      ),
      clock.runtime,
    );
    await client.stream(context, vi.fn());
    expect(clock.timers).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(clock.timers).toHaveBeenCalledWith(expect.any(Function), 45_000);
    expect(clock.timers).toHaveBeenCalledTimes(3);
  });

  it("cleans up on caller abort without exposing transport details", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      new OpenCodeEventStreamClient(credentials, vi.fn()).stream(context, vi.fn(), abort.signal),
    ).resolves.toBeUndefined();
  });
});
