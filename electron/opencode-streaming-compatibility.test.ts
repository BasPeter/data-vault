import { describe, expect, it } from "vitest";
import {
  OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED,
  supportsOpenCodeStreaming,
} from "./opencode-streaming-compatibility";

describe("OpenCode streaming compatibility", () => {
  it("enables only a schema-proven stable 1.18.16 release or newer", () => {
    expect(OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED).toBe(true);
    expect(supportsOpenCodeStreaming("1.18.16", OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED)).toBe(true);
    expect(supportsOpenCodeStreaming("1.18.17", OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED)).toBe(true);
    expect(supportsOpenCodeStreaming("2.0.0", OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED)).toBe(true);
    expect(supportsOpenCodeStreaming("1.18.16+build.1", OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED)).toBe(true);
  });

  it("keeps compatible older stable releases and prereleases polling-only", () => {
    for (const version of ["1.1.10", "1.18.15", "1.18.16-rc.1", "2.0.0-beta.1"]) {
      expect(supportsOpenCodeStreaming(version, true)).toBe(false);
    }
  });

  it("fails closed for malformed versions and an unproven fixture schema", () => {
    for (const version of [undefined, "v1.18.16", "1.18", "01.18.16", "1.18.16.0"]) {
      expect(supportsOpenCodeStreaming(version, true)).toBe(false);
    }
    expect(supportsOpenCodeStreaming("1.18.16", false)).toBe(false);
  });
});
