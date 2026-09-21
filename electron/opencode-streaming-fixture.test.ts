import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "opencode-event-1.18.16.json");

describe("OpenCode 1.18.16 authenticated event fixture", () => {
  it("records only the redacted LF-only structural proof required by the streaming gate", () => {
    const raw = fs.readFileSync(fixturePath, "utf8");
    const fixture = JSON.parse(raw) as Record<string, unknown>;

    expect(raw).not.toContain("\r\n");
    expect(fixture.source).toMatchObject({
      authenticated: true,
      opencodeVersion: "1.18.16",
      eventTransport: { method: "GET", route: "/event", status: 200, contentType: "text/event-stream", framing: "LF" },
      promptAsync: { status: 204, messageID: "msg_<token>" },
    });
    expect(fixture.optionalPreludeEventNames).toEqual(["server.connected", "session.created"]);
    expect(fixture.events).toEqual([
      {
        event: "message.updated",
        data: {
          sessionID: "session_<redacted>",
          info: { id: "msg_<assistant>", role: "assistant", parentID: "msg_<token>" },
        },
      },
      {
        event: "message.part.delta",
        data: {
          sessionID: "session_<redacted>",
          messageID: "msg_<assistant>",
          partID: "part_<redacted>",
          field: "text",
          delta: "<redacted>",
          deltaLength: 2,
        },
      },
      { event: "session.status", data: { sessionID: "session_<redacted>", status: { type: "idle" } } },
      { event: "session.idle", data: { sessionID: "session_<redacted>" } },
    ]);
    expect(fixture.notObservedHere).toEqual(["CRLF framing", "multiline data", "comment keepalives"]);
    expect(fixture.syntheticParserCoverageRequired).toEqual(["CRLF framing", "multiline data", "comment keepalives"]);
  });
});
