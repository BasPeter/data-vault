import { describe, expect, it } from "vitest";
import {
  dashboardMainFrameIfAlive,
  isAuthenticatedDashboardSender,
  isExactDashboardOriginRequest,
  validateDashboardApiArgument,
  validateDashboardBounds,
} from "./dashboard-runtime-policy";

describe("dashboard runtime bounds", () => {
  const content = { x: 0, y: 0, width: 1280, height: 820 };
  const allowed = { x: 512, y: 56, width: 768, height: 764 };

  it("intersects renderer bounds with main-owned content away from trusted chrome", () => {
    expect(validateDashboardBounds({ x: 0, y: 0, width: 1280, height: 820 }, content, allowed)).toEqual(allowed);
    expect(validateDashboardBounds({ x: 500.2, y: 55.2, width: 100.1, height: 100.1 }, content, allowed)).toEqual({
      x: 512,
      y: 56,
      width: 89,
      height: 100,
    });
  });

  it("rejects empty, non-finite, negative, oversized, and malformed bounds", () => {
    for (const value of [
      null,
      { x: 0, y: 0, width: 0, height: 1 },
      { x: -1, y: 0, width: 1, height: 1 },
      { x: Number.NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 100_001, height: 1 },
      { x: 0, y: 0, width: 1, height: 1, extra: true },
    ]) {
      expect(validateDashboardBounds(value, content, allowed)).toBeNull();
    }
  });
});

describe("dashboard request isolation", () => {
  it("accepts only the active opaque custom origin", () => {
    expect(isExactDashboardOriginRequest("vault-dashboard://runtime/index.html", "runtime")).toBe(true);
    expect(isExactDashboardOriginRequest("vault-dashboard://other/index.html", "runtime")).toBe(false);
    expect(isExactDashboardOriginRequest("https://example.com/", "runtime")).toBe(false);
    expect(isExactDashboardOriginRequest("file:///secret", "runtime")).toBe(false);
    expect(isExactDashboardOriginRequest("data:text/plain,secret", "runtime")).toBe(false);
  });
});

describe("dashboard API authentication", () => {
  it("requires the exact sender, main frame, and current authority generation", () => {
    const sender = { id: 1 };
    const otherSender = { id: 2 };
    const mainFrame = {};
    const childFrame = {};
    const generation = Symbol("active");
    const active = { sender, frame: mainFrame, generation, grantedGeneration: generation };

    expect(isAuthenticatedDashboardSender(active, sender, mainFrame)).toBe(true);
    expect(isAuthenticatedDashboardSender(active, otherSender, mainFrame)).toBe(false);
    expect(isAuthenticatedDashboardSender(active, sender, childFrame)).toBe(false);
    expect(isAuthenticatedDashboardSender(active, sender, null)).toBe(false);
    expect(isAuthenticatedDashboardSender({ ...active, grantedGeneration: Symbol("stale") }, sender, mainFrame)).toBe(
      false,
    );
    expect(isAuthenticatedDashboardSender({ ...active, grantedGeneration: undefined }, sender, mainFrame)).toBe(false);
  });

  it("accepts only exact fixed request shapes and bounded document arrays", () => {
    expect(() => validateDashboardApiArgument("get-info", undefined)).not.toThrow();
    expect(() => validateDashboardApiArgument("write-state", { state: { complete: true } })).not.toThrow();
    expect(() => validateDashboardApiArgument("read-documents", { documentIds: ["goal.html"] })).not.toThrow();
    for (const [operation, value] of [
      ["get-info", {}],
      ["write-state", { state: null, path: "outside" }],
      ["read-documents", { documentIds: Array.from({ length: 21 }, () => "goal.html") }],
      ["read-documents", { documentIds: [""] }],
      ["read-documents", { documentIds: [], method: "invented" }],
    ] as const)
      expect(() => validateDashboardApiArgument(operation, value)).toThrow("Invalid dashboard API request");
  });

  it("rejects destroyed contents before reading its native mainFrame", () => {
    let mainFrameReads = 0;
    const contents = {
      isDestroyed: () => true,
      get mainFrame(): object {
        mainFrameReads += 1;
        throw new TypeError("Object has been destroyed");
      },
    };
    expect(dashboardMainFrameIfAlive(contents)).toBeNull();
    expect(mainFrameReads).toBe(0);
  });
});

describe("dashboard secrets api arguments", () => {
  it("requires list-secrets to carry no argument", () => {
    expect(() => validateDashboardApiArgument("list-secrets", undefined)).not.toThrow();
    expect(() => validateDashboardApiArgument("list-secrets", {})).toThrow("Invalid dashboard API request");
  });

  it("requires secure-fetch to carry exactly a request object", () => {
    expect(() => validateDashboardApiArgument("secure-fetch", { request: { url: "https://a.example" } })).not.toThrow();
    expect(() => validateDashboardApiArgument("secure-fetch", undefined)).toThrow("Invalid dashboard API request");
    expect(() => validateDashboardApiArgument("secure-fetch", { request: {}, extra: 1 })).toThrow(
      "Invalid dashboard API request",
    );
    expect(() => validateDashboardApiArgument("secure-fetch", { request: "no" })).toThrow(
      "Invalid dashboard API request",
    );
  });

  // The dispatch used to end in a read-documents fallthrough, so an operation
  // without its own branch would have been silently treated as a document read.
  it("rejects an unknown operation instead of falling through to read-documents", () => {
    expect(() =>
      validateDashboardApiArgument("invented" as Parameters<typeof validateDashboardApiArgument>[0], {
        documentIds: ["a"],
      }),
    ).toThrow("Invalid dashboard API request");
  });
});
