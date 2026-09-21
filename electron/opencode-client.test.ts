import { describe, expect, it, vi } from "vitest";
import {
  OpenCodeClient,
  OpenCodeClientError,
  OPENCODE_MAX_RESPONSE_BYTES,
  OPENCODE_TRANSCRIPT_PAGE_LIMIT,
  validateOpenCodePort,
} from "./opencode-client";

const credentials = { port: 4096, username: "user", password: "password" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

describe("OpenCodeClient", () => {
  it("accepts only canonical TCP ports", () => {
    expect(validateOpenCodePort(1)).toBe(1);
    expect(validateOpenCodePort(65535)).toBe(65535);
    for (const value of [0, 65536, 1.5, Number.NaN, "4096"]) {
      expect(() => validateOpenCodePort(value)).toThrow(OpenCodeClientError);
    }
  });

  it("health-gates setup with a healthy strict semver at least 1.1.10", async () => {
    const fetchImpl = vi.fn(async () => json({ healthy: true, version: "1.1.10" })) as unknown as typeof fetch;
    await expect(new OpenCodeClient(credentials, fetchImpl).health()).resolves.toBeUndefined();
    for (const health of [
      { healthy: false, version: "9.0.0" },
      { healthy: true, version: "1.1.9" },
      { healthy: true, version: "1.1.10-rc.1" },
      { healthy: true, version: "v1.2.0" },
    ]) {
      await expect(
        new OpenCodeClient(credentials, vi.fn(async () => json(health)) as unknown as typeof fetch).health(),
      ).rejects.toThrow("OpenCode is unavailable.");
    }
  });

  it("returns only the validated health version for the streaming compatibility gate", async () => {
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => json({ healthy: true, version: "1.18.16" })) as unknown as typeof fetch,
      ).healthVersion(),
    ).resolves.toBe("1.18.16");
  });

  it("constructs only documented fixed routes with Basic auth, redirect refusal, and a ten-second timeout", async () => {
    const fetchImpl = vi.fn(async () => json({ healthy: true, version: "1.2.0" })) as unknown as typeof fetch;
    await new OpenCodeClient(credentials, fetchImpl).health();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4096/global/health");
    expect(init).toMatchObject({ method: "GET", redirect: "error" });
    expect((init?.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("user:password").toString("base64")}`,
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("requests the exact 10,000 ms AbortSignal timeout", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      await new OpenCodeClient(
        credentials,
        vi.fn(async () => json({ healthy: true, version: "1.2.0" })) as unknown as typeof fetch,
      ).health();
      expect(timeout).toHaveBeenCalledWith(10_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("accepts only each route's documented exact JSON status and content type", async () => {
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
      ).health(),
    ).rejects.toThrow("OpenCode request failed.");
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => json({ healthy: true, version: "1.2.0" }, 201)) as unknown as typeof fetch,
      ).health(),
    ).rejects.toThrow("OpenCode request failed.");
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(
          async () =>
            new Response(JSON.stringify({ healthy: true, version: "1.2.0" }), {
              headers: { "content-type": "application/jsonp" },
            }),
        ) as unknown as typeof fetch,
      ).health(),
    ).rejects.toThrow("OpenCode request failed.");
  });

  it("rejects unexpected 2xx statuses for every non-prompt fixed route", async () => {
    const unexpected2xx = vi.fn(async () => json({}, 201)) as unknown as typeof fetch;
    const client = new OpenCodeClient(credentials, unexpected2xx);
    await expect(client.health()).rejects.toThrow("OpenCode request failed.");
    await expect(client.createSession()).rejects.toThrow("OpenCode request failed.");
    await expect(client.status("owned")).rejects.toThrow("OpenCode request failed.");
    await expect(client.messages("owned")).rejects.toThrow("OpenCode request failed.");
    await expect(client.abort("owned")).rejects.toThrow("OpenCode request failed.");
    expect(unexpected2xx).toHaveBeenCalledTimes(5);
  });

  it("accepts prompt_async only as an empty 204 response", async () => {
    const client = new OpenCodeClient(
      credentials,
      vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
    );
    await expect(client.sendPrompt("owned", "hello")).resolves.toBeUndefined();
    const malformed = { status: 204, body: new ReadableStream(), headers: new Headers() } as unknown as Response;
    await expect(
      new OpenCodeClient(credentials, vi.fn(async () => malformed) as unknown as typeof fetch).sendPrompt(
        "owned",
        "hello",
      ),
    ).rejects.toThrow("OpenCode request failed.");
  });

  it("sends a validated caller message ID only in the documented prompt_async body", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await new OpenCodeClient(credentials, fetchImpl).sendPrompt("owned", "hello", "msg_123");
    expect(JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body))).toEqual({
      parts: [{ type: "text", text: "hello" }],
      messageID: "msg_123",
    });
    await expect(
      new OpenCodeClient(credentials, fetchImpl).sendPrompt("owned", "hello", "not/a-valid-id"),
    ).rejects.toThrow("OpenCode request failed.");
  });

  it("cancels an oversized stream before JSON parsing", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(OPENCODE_MAX_RESPONSE_BYTES + 1)));
      },
      cancel,
    });
    const client = new OpenCodeClient(
      credentials,
      vi.fn(
        async () => new Response(body, { headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch,
    );
    await expect(client.health()).rejects.toThrow("OpenCode request failed.");
    expect(cancel).toHaveBeenCalled();
  });

  it("uses a fixed twenty-message transcript page, preserves OpenCode's chronological page, and rejects caller-sized defaults", async () => {
    const chronological = [
      {
        info: { id: "m1", role: "user", time: { created: "2026-08-12T12:00:00.000Z" } },
        parts: [{ type: "text", text: "first" }],
      },
      {
        info: { id: "m2", role: "assistant", time: { created: "2026-08-12T12:00:01.000Z" } },
        parts: [{ type: "text", text: "second" }],
      },
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:4096/session/owned/message?limit=20") return json(chronological);
      return json(Array.from({ length: 101 }, () => chronological[0]));
    }) as unknown as typeof fetch;

    await expect(new OpenCodeClient(credentials, fetchImpl).messages("owned")).resolves.toEqual([
      { id: "m1", role: "user", text: "first", createdAt: "2026-08-12T12:00:00.000Z" },
      { id: "m2", role: "assistant", text: "second", createdAt: "2026-08-12T12:00:01.000Z" },
    ]);
    expect(OPENCODE_TRANSCRIPT_PAGE_LIMIT).toBe(20);
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("http://127.0.0.1:4096/session/owned/message?limit=20");
  });

  it("cancels a single oversized transcript response with a fixed redacted code", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(OPENCODE_MAX_RESPONSE_BYTES + 1)));
      },
      cancel,
    });
    const error = await new OpenCodeClient(
      credentials,
      vi.fn(
        async () => new Response(body, { headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch,
    )
      .messages("owned")
      .catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(OpenCodeClientError);
    expect((error as OpenCodeClientError).code).toBe("transcript-too-large");
    expect(String(error)).toBe("OpenCodeClientError: OpenCode request failed.");
    expect(cancel).toHaveBeenCalled();
  });

  it("projects only bounded DTO fields and maps retry status to busy", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/session/status"))
        return json({ owned: { type: "retry", diagnostic: "/private" }, foreign: { type: "idle" } });
      if (url.endsWith("/session/owned/message?limit=20")) {
        return json([
          {
            info: { id: "m1", role: "assistant", time: { created: "2026-08-12T12:00:00.000Z" }, ignored: "x" },
            parts: [
              { type: "text", text: "safe" },
              { type: "tool", output: "/secret" },
            ],
          },
          {
            info: { id: "m2", role: "tool", time: { created: "2026-08-12T12:00:00.000Z" } },
            parts: [{ type: "text", text: "drop" }],
          },
        ]);
      }
      return json({ id: "owned", title: "Session", time: { created: "2026-08-12T12:00:00.000Z" }, unsafe: "drop" });
    }) as unknown as typeof fetch;
    const client = new OpenCodeClient(credentials, fetchImpl);
    await expect(client.createSession("Session")).resolves.toEqual({
      id: "owned",
      title: "Session",
      createdAt: "2026-08-12T12:00:00.000Z",
    });
    await expect(client.status("owned")).resolves.toEqual({ state: "busy" });
    await expect(client.messages("owned")).resolves.toEqual([
      { id: "m1", role: "assistant", text: "safe", createdAt: "2026-08-12T12:00:00.000Z" },
    ]);
  });

  it("normalizes OpenCode epoch-millisecond timestamps in real session and message response shapes", async () => {
    const created = Date.UTC(2026, 7, 12, 12, 0, 0);
    const createdAt = "2026-08-12T12:00:00.000Z";
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/session/owned/message?limit=20")) {
        return json([
          { info: { id: "m1", role: "assistant", time: { created } }, parts: [{ type: "text", text: "safe" }] },
        ]);
      }
      return json({ id: "owned", title: "Session", time: { created } });
    }) as unknown as typeof fetch;
    const client = new OpenCodeClient(credentials, fetchImpl);

    await expect(client.createSession("Session")).resolves.toEqual({ id: "owned", title: "Session", createdAt });
    await expect(client.messages("owned")).resolves.toEqual([{ id: "m1", role: "assistant", text: "safe", createdAt }]);
  });

  it("rejects invalid numeric remote timestamps while retaining ISO timestamp compatibility", async () => {
    for (const created of [
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      8.64e15 + 1,
    ]) {
      await expect(
        new OpenCodeClient(
          credentials,
          vi.fn(async () => json({ id: "owned", title: "Session", time: { created } })) as unknown as typeof fetch,
        ).createSession("Session"),
      ).rejects.toThrow("OpenCode request failed.");
    }
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () =>
          json([
            {
              info: { id: "m1", role: "assistant", time: { created: "2026-08-12T12:00:00.000Z" } },
              parts: [{ type: "text", text: "safe" }],
            },
          ]),
        ) as unknown as typeof fetch,
      ).messages("owned"),
    ).resolves.toEqual([{ id: "m1", role: "assistant", text: "safe", createdAt: "2026-08-12T12:00:00.000Z" }]);
  });

  it("rejects excessive nesting and every projected DTO bound", async () => {
    const nested: unknown[] = [];
    let cursor = nested;
    for (let index = 0; index < 9; index += 1) {
      const child: unknown[] = [];
      cursor.push(child);
      cursor = child;
    }
    await expect(
      new OpenCodeClient(credentials, vi.fn(async () => json(nested)) as unknown as typeof fetch).health(),
    ).rejects.toThrow("OpenCode request failed.");
    const invalidMessages = Array.from({ length: 101 }, (_, index) => ({
      info: { id: `m${index}`, role: "assistant", time: { created: "not-a-timestamp" } },
      parts: [{ type: "text", text: "x".repeat(8001) }],
    }));
    await expect(
      new OpenCodeClient(credentials, vi.fn(async () => json(invalidMessages)) as unknown as typeof fetch).messages(
        "owned",
      ),
    ).rejects.toThrow("OpenCode request failed.");
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () =>
          json({ id: "x".repeat(129), title: "x".repeat(121), time: { created: "x".repeat(41) } }),
        ) as unknown as typeof fetch,
      ).createSession(""),
    ).rejects.toThrow("OpenCode request failed.");
  });

  it("rejects every bounded setup and operation input before network activity", async () => {
    const fetchImpl = vi.fn(async () => json({ healthy: true, version: "1.2.0" })) as unknown as typeof fetch;
    for (const invalid of [
      { ...credentials, username: "" },
      { ...credentials, username: "u".repeat(257) },
      { ...credentials, password: "" },
      { ...credentials, password: "p".repeat(1025) },
    ]) {
      expect(() => new OpenCodeClient(invalid, fetchImpl)).toThrow("OpenCode request failed.");
    }
    const client = new OpenCodeClient(credentials, fetchImpl);
    await expect(client.createSession("t".repeat(121))).rejects.toThrow("OpenCode request failed.");
    await expect(client.sendPrompt("owned", "")).rejects.toThrow("OpenCode request failed.");
    await expect(client.sendPrompt("owned", "p".repeat(8001))).rejects.toThrow("OpenCode request failed.");
    for (const id of ["", "x".repeat(129), "id/with/slash"]) {
      await expect(client.status(id)).rejects.toThrow("OpenCode request failed.");
      await expect(client.messages(id)).rejects.toThrow("OpenCode request failed.");
      await expect(client.sendPrompt(id, "prompt")).rejects.toThrow("OpenCode request failed.");
      await expect(client.abort(id)).rejects.toThrow("OpenCode request failed.");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("omits valid messages without text while rejecting malformed user and assistant text parts", async () => {
    const message = {
      info: { id: "m1", role: "assistant", time: { created: "2026-08-12T12:00:00.000Z" } },
      parts: [{ type: "text", text: "text" }],
    };
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () =>
          json([
            { ...message, info: { ...message.info, id: "m2", role: "user" }, parts: [{ type: "tool" }] },
            { ...message, info: { ...message.info, id: "m3" }, parts: [{ type: "reasoning" }] },
            { ...message, info: { ...message.info, id: "m4" }, parts: [{ type: "step-start" }] },
          ]),
        ) as unknown as typeof fetch,
      ).messages("owned"),
    ).resolves.toEqual([]);

    for (const parts of [null, [{ type: "text" }], [{ type: "text", text: "x".repeat(8001) }]]) {
      await expect(
        new OpenCodeClient(
          credentials,
          vi.fn(async () => json([{ ...message, parts }])) as unknown as typeof fetch,
        ).messages("owned"),
      ).rejects.toThrow("OpenCode request failed.");
    }
  });

  it("enforces message IDs, timestamps, roles, counts, and status states", async () => {
    const message = {
      info: { id: "m1", role: "assistant", time: { created: "2026-08-12T12:00:00.000Z" } },
      parts: [{ type: "text", text: "text" }],
    };
    for (const invalid of [
      { ...message, info: { ...message.info, id: "!" } },
      { ...message, info: { ...message.info, time: { created: "2026-99-99T12:00:00Z" } } },
      { ...message, parts: [{ type: "text", text: "x".repeat(8001) }] },
    ]) {
      await expect(
        new OpenCodeClient(credentials, vi.fn(async () => json([invalid])) as unknown as typeof fetch).messages(
          "owned",
        ),
      ).rejects.toThrow("OpenCode request failed.");
    }
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () =>
          json([message, { ...message, info: { ...message.info, role: "tool" } }]),
        ) as unknown as typeof fetch,
      ).messages("owned"),
    ).resolves.toEqual([{ id: "m1", role: "assistant", text: "text", createdAt: "2026-08-12T12:00:00.000Z" }]);
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => json(Array.from({ length: 101 }, () => message))) as unknown as typeof fetch,
      ).messages("owned"),
    ).rejects.toThrow("OpenCode request failed.");
    for (const [type, result] of [
      ["busy", "busy"],
      ["idle", "idle"],
      ["retry", "busy"],
    ] as const) {
      await expect(
        new OpenCodeClient(
          credentials,
          vi.fn(async () => json({ owned: { type, ignored: "x" } })) as unknown as typeof fetch,
        ).status("owned"),
      ).resolves.toEqual({ state: result });
    }
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => json({ owned: { type: "waiting" } })) as unknown as typeof fetch,
      ).status("owned"),
    ).rejects.toThrow("OpenCode request failed.");
  });

  it("treats an omitted owned-session status as idle while rejecting malformed owned entries", async () => {
    for (const statuses of [{}, { foreign: { type: "idle" } }]) {
      await expect(
        new OpenCodeClient(credentials, vi.fn(async () => json(statuses)) as unknown as typeof fetch).status("owned"),
      ).resolves.toEqual({ state: "idle" });
    }

    for (const statuses of [{ owned: null }, { owned: { type: "waiting" } }]) {
      await expect(
        new OpenCodeClient(credentials, vi.fn(async () => json(statuses)) as unknown as typeof fetch).status("owned"),
      ).rejects.toThrow("OpenCode request failed.");
    }
  });

  it("accepts each maximum DTO boundary while returning only the fixed shapes", async () => {
    const id = "i".repeat(128);
    const title = "t".repeat(120);
    const text = "x".repeat(8000);
    const createdAt = "2026-08-12T12:00:00.1234567890123456789Z";
    const message = {
      info: { id, role: "user", time: { created: createdAt } },
      parts: [{ type: "text", text: "x" }],
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/session/status")) return json({ [id]: { type: "idle", unknown: "drop" } });
      if (url.endsWith(`/session/${id}/message?limit=20`)) return json(Array.from({ length: 100 }, () => message));
      return json({ id, title, time: { created: createdAt }, unknown: "drop" });
    }) as unknown as typeof fetch;
    const client = new OpenCodeClient(
      { port: 65535, username: "u".repeat(256), password: "p".repeat(1024) },
      fetchImpl,
    );
    await expect(client.createSession(title)).resolves.toEqual({ id, title, createdAt });
    await expect(client.status(id)).resolves.toEqual({ state: "idle" });
    await expect(client.messages(id)).resolves.toEqual(
      Array.from({ length: 100 }, () => ({ id, role: "user", text: "x", createdAt })),
    );
    await expect(
      new OpenCodeClient(
        credentials,
        vi.fn(async () => json([{ ...message, parts: [{ type: "text", text }] }])) as unknown as typeof fetch,
      ).messages(id),
    ).resolves.toEqual([{ id, role: "user", text, createdAt }]);
  });

  it("redacts credentials and authorization from transport failures", async () => {
    const authorization = `Basic ${Buffer.from("user:password").toString("base64")}`;
    const error = await new OpenCodeClient(
      credentials,
      vi.fn(async () => {
        throw new Error(`failed ${authorization} user password`);
      }) as unknown as typeof fetch,
    )
      .health()
      .catch((caught: Error) => caught);
    const output = String(error);
    for (const secret of ["user", "password", authorization, "Authorization"]) expect(output).not.toContain(secret);
  });
});
