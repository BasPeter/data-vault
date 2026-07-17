import {
  DASHBOARD_DOCUMENT_ID_MAX_LENGTH,
  DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT,
  DASHBOARD_STATE_MAX_BYTES,
} from "../src/dashboard-contracts";

export const DASHBOARD_PRELOAD_STATE_MAX_DEPTH = 64;
export const DASHBOARD_PRELOAD_STATE_MAX_NODES = 100_000;
export const DASHBOARD_PRELOAD_STATE_MAX_STRING_BYTES = DASHBOARD_STATE_MAX_BYTES;

function invalid(): never {
  throw new Error("Invalid dashboard API request.");
}

function encodedStringBytes(value: string): number {
  if (value.length > DASHBOARD_PRELOAD_STATE_MAX_STRING_BYTES) invalid();
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > DASHBOARD_PRELOAD_STATE_MAX_STRING_BYTES) invalid();
  return bytes;
}

export function validatePreloadDashboardState(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  let approximateBytes = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > DASHBOARD_PRELOAD_STATE_MAX_NODES || current.depth > DASHBOARD_PRELOAD_STATE_MAX_DEPTH) invalid();
    approximateBytes += 1;
    const value = current.value;
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) invalid();
      approximateBytes += 24;
      continue;
    }
    if (typeof value === "string") {
      approximateBytes += encodedStringBytes(value) + 2;
      if (approximateBytes > DASHBOARD_STATE_MAX_BYTES) invalid();
      continue;
    }
    if (typeof value !== "object") invalid();
    if (seen.has(value)) invalid();
    seen.add(value);

    if (Array.isArray(value)) {
      approximateBytes += value.length;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: value[index], depth: current.depth + 1 });
      }
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) invalid();
      const entries = Object.entries(value as Record<string, unknown>);
      approximateBytes += entries.length;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, child] = entries[index];
        approximateBytes += encodedStringBytes(key) + 3;
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
    if (approximateBytes > DASHBOARD_STATE_MAX_BYTES) invalid();
  }
  if (approximateBytes > DASHBOARD_STATE_MAX_BYTES) invalid();
}

export function validatePreloadDocumentIds(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT) invalid();
  for (const id of value) {
    if (typeof id !== "string" || id.length < 1 || id.length > DASHBOARD_DOCUMENT_ID_MAX_LENGTH) invalid();
    encodedStringBytes(id);
  }
}
