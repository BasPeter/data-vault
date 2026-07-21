import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_SCHEMA_VERSION,
  DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES,
  type DashboardManifest,
  type DashboardSecureFetchInput,
} from "../src/dashboard-contracts";
import { DashboardSecretUnsetError, performDashboardSecureFetch } from "./dashboard-secure-fetch";

// Deliberately contains characters URL encoding rewrites (`+`, `/`, `=`, space) —
// the shape of a real base64 token. A fixture of only URL-safe characters would
// pass even if redaction matched the raw value alone, which is exactly how an
// encoded-echo leak slipped through review once already.
const SECRET = "aB3+x/y=z token";

const manifest: DashboardManifest = {
  schemaVersion: DASHBOARD_SCHEMA_VERSION,
  id: "reporting",
  title: "Reporting",
  icon: "chart",
  color: "blue",
  kind: "blank",
  entrypoint: "index.html",
  requestedCapabilities: ["secrets:use"],
  secrets: [{ name: "NOTION_TOKEN", origins: ["https://api.notion.com"] }],
};

function request(overrides: Partial<DashboardSecureFetchInput> = {}): DashboardSecureFetchInput {
  return {
    url: "https://api.notion.com/v1/databases",
    method: "GET",
    secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-bearer" } },
    ...overrides,
  };
}

function deps(fetchImpl: typeof fetch) {
  return { resolveSecret: () => SECRET, fetchImpl };
}

function depsWithUnsetSecret(fetchImpl: typeof fetch) {
  return { resolveSecret: () => undefined, fetchImpl };
}

function ok(body = "{}", init: ResponseInit = {}) {
  return vi.fn(async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

describe("dashboard secure fetch origin binding", () => {
  // A hostile dashboard must not be able to make the host deliver the secret to
  // an origin the user never approved.
  it("refuses an origin the manifest did not declare for that secret", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(manifest, request({ url: "https://attacker.example/collect" }), deps(fetchImpl)),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a subdomain of a declared origin", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(manifest, request({ url: "https://evil.api.notion.com/x" }), deps(fetchImpl)),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-HTTPS URL", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(manifest, request({ url: "http://api.notion.com/v1" }), deps(fetchImpl)),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // `https://api.notion.com@attacker.example` has origin attacker.example but
  // reads like the declared host.
  it("refuses a URL carrying userinfo", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(
        manifest,
        request({ url: "https://api.notion.com@attacker.example/collect" }),
        deps(fetchImpl),
      ),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a secret the manifest did not declare", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(
        manifest,
        request({ secret: { name: "OTHER_TOKEN", inject: { kind: "authorization-bearer" } } }),
        deps(fetchImpl),
      ),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("dashboard secure fetch injection", () => {
  it.each(["", "x".repeat(257), "user:name", "user\rname", "user\nname", "user\0name"])(
    "rejects invalid Basic username %j before secret resolution or network activity",
    async (username) => {
      const resolveSecret = vi.fn(() => SECRET);
      const fetchImpl = ok();
      await expect(
        performDashboardSecureFetch(
          manifest,
          request({ secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-basic", username } } }),
          { resolveSecret, fetchImpl },
        ),
      ).rejects.toThrow("Invalid dashboard API request.");
      expect(resolveSecret).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("injects the secret as a bearer token without returning it", async () => {
    const fetchImpl = ok('{"ok":true}');
    const result = await performDashboardSecureFetch(manifest, request(), deps(fetchImpl));

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Headers).get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("composes a UTF-8 Basic credential in the host", async () => {
    const fetchImpl = ok();
    const username = "josé@example.com";
    await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-basic", username } } }),
      deps(fetchImpl),
    );

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = Buffer.from(`${username}:${SECRET}`, "utf8").toString("base64");
    expect((init.headers as Headers).get("authorization")).toBe(`Basic ${payload}`);
  });

  it("rejects caller-supplied authorization before secret resolution or network activity", async () => {
    const resolveSecret = vi.fn(() => SECRET);
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(
        manifest,
        request({
          headers: { Authorization: "Basic attacker-chosen" },
          secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-basic", username: "user" } },
        }),
        { resolveSecret, fetchImpl },
      ),
    ).rejects.toThrow("Invalid dashboard API request.");
    expect(resolveSecret).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("injects into a named header and a query parameter", async () => {
    const headerFetch = ok();
    await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "header", header: "X-Api-Key" } } }),
      deps(headerFetch),
    );
    const [, headerInit] = (headerFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((headerInit.headers as Headers).get("x-api-key")).toBe(SECRET);

    const queryFetch = ok();
    await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } } }),
      deps(queryFetch),
    );
    const [queryUrl] = (queryFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((queryUrl as URL).searchParams.get("token")).toBe(SECRET);
  });

  // Dashboard-supplied fields must never win over the host's injection, or the
  // dashboard could neutralise authentication or read back what was sent.
  it("refuses a caller header that collides with the injection point", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(
        manifest,
        request({ headers: { Authorization: "Bearer attacker-chosen" } }),
        deps(fetchImpl),
      ),
    ).rejects.toThrow("Invalid dashboard API request.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a caller query parameter that collides with the injection point", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(
        manifest,
        request({
          url: "https://api.notion.com/v1?token=attacker",
          secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } },
        }),
        deps(fetchImpl),
      ),
    ).rejects.toThrow("Invalid dashboard API request.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("dashboard secure fetch response handling", () => {
  it("does not follow redirects, so the secret cannot reach a redirect target", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 302, headers: { location: "https://attacker.example/collect" } }),
    ) as unknown as typeof fetch;

    const result = await performDashboardSecureFetch(manifest, request(), deps(fetchImpl));

    expect(result.status).toBe(302);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].redirect).toBe("manual");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("truncates an oversized response body", async () => {
    const oversized = "a".repeat(DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES + 1024);
    const result = await performDashboardSecureFetch(manifest, request(), deps(ok(oversized)));

    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES);
  });

  it("drops session-bearing response headers", async () => {
    const fetchImpl = ok("{}", { headers: { "set-cookie": "session=abc", "content-type": "application/json" } });
    const result = await performDashboardSecureFetch(manifest, request(), deps(fetchImpl));

    expect(Object.keys(result.headers).map((name) => name.toLowerCase())).not.toContain("set-cookie");
    expect(result.headers["content-type"]).toBe("application/json");
  });

  it("reports an unset secret distinctly and never contacts the remote", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(manifest, request(), depsWithUnsetSecret(fetchImpl)),
    ).rejects.toBeInstanceOf(DashboardSecretUnsetError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // A transport error's cause can embed the outgoing request, secret included.
  it("does not leak the secret through a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED while sending Bearer ${SECRET}`);
    }) as unknown as typeof fetch;

    const error = await performDashboardSecureFetch(manifest, request(), deps(fetchImpl)).catch(
      (caught: Error) => caught,
    );

    expect(String(error)).not.toContain(SECRET);
    expect((error as Error).message).toBe("Dashboard request failed.");
  });
});

describe("dashboard secure fetch never returns the secret", () => {
  it("redacts the Basic payload and complete authorization value from responses", async () => {
    const username = "user@example.com";
    const payload = Buffer.from(`${username}:${SECRET}`, "utf8").toString("base64");
    const fieldValue = `Basic ${payload}`;
    const result = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-basic", username } } }),
      deps(ok(`echoed payload=${payload}; field=${fieldValue}`, { headers: { "x-echo": fieldValue } })),
    );

    expect(JSON.stringify(result)).not.toContain(payload);
    expect(JSON.stringify(result)).not.toContain(fieldValue);
    expect(result.body).toContain("[redacted]");
  });

  it("does not leak a derived Basic credential through failure output", async () => {
    const username = "user@example.com";
    const payload = Buffer.from(`${username}:${SECRET}`, "utf8").toString("base64");
    const fetchImpl = vi.fn(async () => {
      throw new Error(`request failed with Basic ${payload}`);
    }) as unknown as typeof fetch;

    const error = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "authorization-basic", username } } }),
      deps(fetchImpl),
    ).catch((caught: Error) => caught);

    expect(String(error)).not.toContain(payload);
    expect((error as Error).message).toBe("Dashboard request failed.");
  });

  // The host writes the secret into the request line for query-param injection,
  // so a redirect that preserves the query string echoes it straight back.
  it("redacts a secret echoed in a redirect Location header", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
          status: 302,
          headers: { location: `https://api.notion.com/v2?token=${SECRET}` },
        }),
    ) as unknown as typeof fetch;

    const result = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } } }),
      deps(fetchImpl),
    );

    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.headers.location).toContain("[redacted]");
  });

  it("redacts a secret echoed in the response body", async () => {
    const result = await performDashboardSecureFetch(manifest, request(), deps(ok(`{"echoed":"${SECRET}"}`)));

    expect(result.body).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  // A failure part-way through the body must not escape the sanitizing catch.
  it("does not leak the secret when the response body stream fails", async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new Error(`stream reset while sending Bearer ${SECRET}`));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const error = await performDashboardSecureFetch(manifest, request(), deps(fetchImpl)).catch(
      (caught: Error) => caught,
    );

    expect(String(error)).not.toContain(SECRET);
    expect((error as Error).message).toBe("Dashboard request failed.");
  });
});

describe("dashboard secure fetch origin normalization", () => {
  // Both the manifest and the request are normalized through URL.origin. Pinning
  // this stops a refactor to raw string comparison from passing silently.
  it.each([
    ["uppercase host", "https://API.NOTION.COM/v1"],
    ["explicit default port", "https://api.notion.com:443/v1"],
  ])("accepts an equivalent declared origin: %s", async (_label, url) => {
    const fetchImpl = ok();
    await expect(performDashboardSecureFetch(manifest, request({ url }), deps(fetchImpl))).resolves.toBeDefined();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("refuses a trailing-dot hostname that is not the declared origin", async () => {
    const fetchImpl = ok();
    await expect(
      performDashboardSecureFetch(manifest, request({ url: "https://api.notion.com./v1" }), deps(fetchImpl)),
    ).rejects.toThrow("Dashboard access denied.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("dashboard secure fetch redaction covers encoded echoes", () => {
  // The host URL-encodes the value when injecting it as a query parameter, so a
  // redirect that preserves the query string echoes it back encoded, not raw.
  it("redacts a percent-encoded secret echoed in a redirect Location", async () => {
    const encoded = encodeURIComponent(SECRET);
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
          status: 302,
          headers: { location: `https://api.notion.com/v2?token=${encoded}` },
        }),
    ) as unknown as typeof fetch;

    const result = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } } }),
      deps(fetchImpl),
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(encoded);
    // Decoding what came back must not reconstruct the secret either.
    expect(decodeURIComponent(result.headers.location ?? "")).not.toContain(SECRET);
  });

  it("redacts the application/x-www-form-urlencoded form, where a space becomes +", async () => {
    const params = new URLSearchParams();
    params.set("token", SECRET);
    const fetchImpl = ok(`echoed ${params.toString()}`);

    const result = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } } }),
      deps(fetchImpl),
    );

    expect(result.body).not.toContain(SECRET);
    expect(result.body).not.toContain(params.toString().slice("token=".length));
  });

  // Truncation happens after redaction, so a secret spanning the cut cannot be
  // walked out one prefix at a time across repeated calls.
  it("does not leave a readable secret prefix at the truncation boundary", async () => {
    const padding = "a".repeat(DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES - 5);
    const result = await performDashboardSecureFetch(manifest, request(), deps(ok(`${padding}${SECRET}`)));

    expect(result.body).not.toContain(SECRET);
    // The first characters of the secret must not survive the cut either.
    expect(result.body.endsWith(SECRET.slice(0, 5))).toBe(false);
    expect(result.body.length).toBeLessThanOrEqual(DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES);
  });
});

describe("dashboard secure fetch truncation cannot leak a prefix", () => {
  // The encoded variants run up to 3x the raw value, so slack sized from the raw
  // secret leaves a readable encoded prefix for any long, encodable secret.
  it("handles a secret whose encoded form is far longer than the raw value", async () => {
    const longSecret = "+".repeat(1400);
    const padding = "a".repeat(DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES - 100);
    const encoded = encodeURIComponent(longSecret);
    const fetchImpl = ok(`${padding}${encoded}`);

    const result = await performDashboardSecureFetch(
      manifest,
      request({ secret: { name: "NOTION_TOKEN", inject: { kind: "query-param", param: "token" } } }),
      { resolveSecret: () => longSecret, fetchImpl },
    );

    expect(result.body).not.toContain(encoded);
    // No decodable run of the secret may survive at the tail either.
    expect(decodeURIComponent(result.body.replace(/%$/, "").replace(/%.$/, ""))).not.toContain("++++");
  });

  // The read limit is counted in BYTES while slicing is in string length. With a
  // multi-byte body the decoded string never reaches a byte-sized cap, so a
  // length-based overflow check never fires and the slack region is returned
  // verbatim. Padding is sized so the secret straddles the byte boundary — three
  // bytes per character, landing just inside the limit — which is the only way to
  // exercise that path.
  it("does not leak a prefix when a multi-byte body straddles the byte limit", async () => {
    const paddingCharacters = Math.floor((DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES + 10) / 3);
    const padding = "あ".repeat(paddingCharacters);
    const result = await performDashboardSecureFetch(manifest, request(), deps(ok(`${padding}${SECRET}`)));

    expect(result.body).not.toContain(SECRET);
    for (let length = 1; length <= SECRET.length; length += 1) {
      expect(result.body.endsWith(SECRET.slice(0, length))).toBe(false);
    }
  });
});
