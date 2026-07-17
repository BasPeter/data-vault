import { describe, expect, it } from "vitest";
import { DASHBOARD_DOCUMENT_ID_MAX_LENGTH, DASHBOARD_STATE_MAX_BYTES } from "../src/dashboard-contracts";
import {
  DASHBOARD_PRELOAD_STATE_MAX_DEPTH,
  DASHBOARD_PRELOAD_STATE_MAX_NODES,
  validatePreloadDashboardState,
  validatePreloadDocumentIds,
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
