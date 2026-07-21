import { describe, expect, it } from "vitest";
import {
  DASHBOARD_BASIC_AUTH_USERNAME_MAX_LENGTH,
  DASHBOARD_DOCUMENT_ID_MAX_LENGTH,
  DASHBOARD_STATE_MAX_BYTES,
} from "../src/dashboard-contracts";
import {
  DASHBOARD_PRELOAD_STATE_MAX_DEPTH,
  DASHBOARD_PRELOAD_STATE_MAX_NODES,
  validatePreloadDashboardState,
  validatePreloadDocumentIds,
  validatePreloadExternalLinkRequest,
  validatePreloadSecureFetchInput,
} from "./dashboard-preload-validation";

describe("dashboard preload state validation", () => {
  it("accepts bounded JSON without recursion", () => {
    expect(() => validatePreloadDashboardState({ completed: true, values: [1, "two", null] })).not.toThrow();
  });

  it("rejects oversized strings, excessive depth and node counts, cycles, and non-JSON values", () => {
    expect(() => validatePreloadDashboardState("x".repeat(DASHBOARD_STATE_MAX_BYTES + 1))).toThrow(
      "Invalid dashboard API request",
    );
    let deep: unknown = null;
    for (let index = 0; index <= DASHBOARD_PRELOAD_STATE_MAX_DEPTH; index += 1) deep = [deep];
    expect(() => validatePreloadDashboardState(deep)).toThrow("Invalid dashboard API request");
    expect(() => validatePreloadDashboardState(new Array(DASHBOARD_PRELOAD_STATE_MAX_NODES).fill(null))).toThrow(
      "Invalid dashboard API request",
    );
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => validatePreloadDashboardState(cyclic)).toThrow("Invalid dashboard API request");
    expect(() => validatePreloadDashboardState({ invalid: Number.NaN })).toThrow("Invalid dashboard API request");
    expect(() => validatePreloadDashboardState({ invalid: () => undefined })).toThrow("Invalid dashboard API request");
  });
});

describe("dashboard preload document ID validation", () => {
  it("accepts at most twenty bounded IDs", () => {
    expect(() =>
      validatePreloadDocumentIds(Array.from({ length: 20 }, (_, index) => `document-${index}`)),
    ).not.toThrow();
  });

  it("rejects excess, empty, non-string, and oversized IDs", () => {
    expect(() => validatePreloadDocumentIds(Array.from({ length: 21 }, (_, index) => `document-${index}`))).toThrow(
      "Invalid dashboard API request",
    );
    expect(() => validatePreloadDocumentIds([""])).toThrow("Invalid dashboard API request");
    expect(() => validatePreloadDocumentIds([1])).toThrow("Invalid dashboard API request");
    expect(() => validatePreloadDocumentIds(["x".repeat(DASHBOARD_DOCUMENT_ID_MAX_LENGTH + 1)])).toThrow(
      "Invalid dashboard API request",
    );
  });
});

describe("dashboard preload external link validation", () => {
  it("accepts only an exact canonical HTTPS destination", () => {
    expect(() => validatePreloadExternalLinkRequest({ url: "https://example.com/path?x=1" })).not.toThrow();
  });

  it.each([
    "http://example.com/",
    "https://user@example.com/",
    "https://example.com/%",
    "https://example.com/%0",
    "https://example.com/a b",
    "https://example.com/\n",
    "HTTPS://example.com/",
    "https://example.com",
    "https:///path",
    `https://example.com/${"x".repeat(8_192)}`,
  ])("rejects unsafe or non-canonical URL %j", (url) => {
    expect(() => validatePreloadExternalLinkRequest({ url })).toThrow("Invalid dashboard API request");
  });

  it("rejects a request with fields beyond its fixed URL surface", () => {
    expect(() => validatePreloadExternalLinkRequest({ url: "https://example.com/", target: "_blank" })).toThrow();
  });
});

describe("dashboard preload secure fetch validation", () => {
  const valid = {
    url: "https://api.example.com/v1",
    method: "GET",
    secret: { name: "API_TOKEN", inject: { kind: "authorization-bearer" } },
  };

  it("accepts a bounded well-formed request", () => {
    expect(() => validatePreloadSecureFetchInput(valid)).not.toThrow();
    expect(() =>
      validatePreloadSecureFetchInput({
        ...valid,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"a":1}',
      }),
    ).not.toThrow();
  });

  it("accepts Basic injection with a bounded non-secret username", () => {
    expect(() =>
      validatePreloadSecureFetchInput({
        ...valid,
        secret: { name: "API_TOKEN", inject: { kind: "authorization-basic", username: "user@example.com" } },
      }),
    ).not.toThrow();
    expect(() =>
      validatePreloadSecureFetchInput({
        ...valid,
        secret: {
          name: "API_TOKEN",
          inject: { kind: "authorization-basic", username: "x".repeat(DASHBOARD_BASIC_AUTH_USERNAME_MAX_LENGTH) },
        },
      }),
    ).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["over limit", "x".repeat(DASHBOARD_BASIC_AUTH_USERNAME_MAX_LENGTH + 1)],
    ["colon", "user:name"],
    ["carriage return", "user\rname"],
    ["line feed", "user\nname"],
    ["NUL", "user\0name"],
  ])("rejects a Basic username that is %s", (_reason, username) => {
    expect(() =>
      validatePreloadSecureFetchInput({
        ...valid,
        secret: { name: "API_TOKEN", inject: { kind: "authorization-basic", username } },
      }),
    ).toThrow("Invalid dashboard API request");
  });

  it("rejects unknown fields so new request surface cannot be smuggled in", () => {
    expect(() => validatePreloadSecureFetchInput({ ...valid, followRedirects: true })).toThrow();
    expect(() =>
      validatePreloadSecureFetchInput({
        ...valid,
        secret: { name: "API_TOKEN", inject: { kind: "authorization-bearer" }, value: "x" },
      }),
    ).toThrow();
  });

  it("rejects an unsupported method or malformed secret name", () => {
    expect(() => validatePreloadSecureFetchInput({ ...valid, method: "TRACE" })).toThrow();
    expect(() =>
      validatePreloadSecureFetchInput({ ...valid, secret: { ...valid.secret, name: "lower_case" } }),
    ).toThrow();
  });

  // Newlines in a header value would let a dashboard forge extra request headers.
  it("rejects header injection through newlines and invalid header names", () => {
    expect(() => validatePreloadSecureFetchInput({ ...valid, headers: { "X-A": "one\r\nX-Injected: two" } })).toThrow();
    expect(() => validatePreloadSecureFetchInput({ ...valid, headers: { "Bad Header": "value" } })).toThrow();
  });

  it("rejects an unknown injection kind", () => {
    expect(() =>
      validatePreloadSecureFetchInput({ ...valid, secret: { name: "API_TOKEN", inject: { kind: "body" } } }),
    ).toThrow();
  });

  it("rejects a prototype-polluting request object", () => {
    expect(() => validatePreloadSecureFetchInput(JSON.parse('{"__proto__":{"x":1}}'))).toThrow();
  });
});

describe("dashboard preload secure fetch forbidden headers", () => {
  const valid = {
    url: "https://api.example.com/v1",
    method: "GET",
    secret: { name: "API_TOKEN", inject: { kind: "authorization-bearer" } },
  };

  // Routing/identity headers would let a dashboard reach a different virtual host
  // at a declared origin; auth headers overlap the host's own injection.
  it.each(["Host", "Cookie", "Authorization", "Origin", "Referer", "X-Forwarded-Host"])(
    "rejects the %s request header",
    (name) => {
      expect(() => validatePreloadSecureFetchInput({ ...valid, headers: { [name]: "x" } })).toThrow();
      expect(() => validatePreloadSecureFetchInput({ ...valid, headers: { [name.toLowerCase()]: "x" } })).toThrow();
    },
  );

  it("still allows ordinary content headers", () => {
    expect(() =>
      validatePreloadSecureFetchInput({ ...valid, headers: { "Content-Type": "application/json", Accept: "*/*" } }),
    ).not.toThrow();
  });
});
