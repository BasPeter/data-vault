export const OPENCODE_1_18_16_FIXTURE_SCHEMA_SUPPORTED = true;

const STRICT_STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const STREAMING_MINIMUM_VERSION = [1, 18, 16] as const;

/**
 * Enables the SSE path only for versions covered by the committed authenticated
 * 1.18.16 fixture schema. Health compatibility remains intentionally broader.
 */
export function supportsOpenCodeStreaming(version: unknown, fixtureSchemaSupported: boolean): boolean {
  if (!fixtureSchemaSupported || typeof version !== "string") return false;
  const match = STRICT_STABLE_SEMVER.exec(version);
  if (!match) return false;

  const current = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let index = 0; index < STREAMING_MINIMUM_VERSION.length; index += 1) {
    if (current[index] !== STREAMING_MINIMUM_VERSION[index]) return current[index] > STREAMING_MINIMUM_VERSION[index];
  }
  return true;
}
