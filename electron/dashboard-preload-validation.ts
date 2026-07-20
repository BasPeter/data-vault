import {
  DASHBOARD_DOCUMENT_ID_MAX_LENGTH,
  DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT,
  DASHBOARD_SECRET_NAME_PATTERN,
  DASHBOARD_SECURE_FETCH_HEADER_VALUE_MAX_LENGTH,
  DASHBOARD_SECURE_FETCH_METHODS,
  DASHBOARD_SECURE_FETCH_REQUEST_HEADER_MAX_COUNT,
  DASHBOARD_SECURE_FETCH_REQUEST_MAX_BYTES,
  DASHBOARD_SECURE_FETCH_URL_MAX_LENGTH,
  DASHBOARD_STATE_MAX_BYTES,
  type DashboardSecureFetchInput,
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

const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/**
 * Headers a dashboard may not set. The main process — not undici — has to enforce
 * these: routing and identity headers would let a dashboard reach a different
 * virtual host at a declared origin, and `authorization`/`cookie` overlap the
 * host's own injection.
 */
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "cookie2",
  "authorization",
  "proxy-authorization",
  "origin",
  "referer",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "via",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  // Path rewriting honoured by IIS and some reverse proxies: can reach a
  // different path, past path-scoped auth, at an origin the user consented to.
  "x-original-url",
  "x-rewrite-url",
  "x-http-method-override",
  "te",
  "trailer",
]);

function plainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) invalid();
  }
}

function validateInjection(value: unknown): void {
  const inject = plainObject(value);
  if (inject.kind === "authorization-bearer") {
    onlyKeys(inject, ["kind"]);
    return;
  }
  if (inject.kind === "header") {
    onlyKeys(inject, ["kind", "header"]);
    if (typeof inject.header !== "string" || !HEADER_NAME_PATTERN.test(inject.header)) invalid();
    // The injection point is a header name too, so it must face the same denylist
    // as caller headers or it becomes the way around it.
    if (FORBIDDEN_REQUEST_HEADERS.has(inject.header.toLowerCase())) invalid();
    return;
  }
  if (inject.kind === "query-param") {
    onlyKeys(inject, ["kind", "param"]);
    if (typeof inject.param !== "string" || inject.param.length < 1 || inject.param.length > 64) invalid();
    return;
  }
  invalid();
}

/**
 * Structural and bounds validation only. Capability, declared-secret, and
 * declared-origin authorization are decided authoritatively in the main process.
 */
export function validatePreloadSecureFetchInput(value: unknown): asserts value is DashboardSecureFetchInput {
  const request = plainObject(value);
  onlyKeys(request, ["url", "method", "headers", "body", "secret"]);

  if (
    typeof request.url !== "string" ||
    request.url.length < 1 ||
    request.url.length > DASHBOARD_SECURE_FETCH_URL_MAX_LENGTH
  ) {
    invalid();
  }
  if (
    typeof request.method !== "string" ||
    !(DASHBOARD_SECURE_FETCH_METHODS as readonly string[]).includes(request.method)
  ) {
    invalid();
  }

  if (request.headers !== undefined) {
    const headers = plainObject(request.headers);
    const entries = Object.entries(headers);
    if (entries.length > DASHBOARD_SECURE_FETCH_REQUEST_HEADER_MAX_COUNT) invalid();
    for (const [name, headerValue] of entries) {
      if (!HEADER_NAME_PATTERN.test(name)) invalid();
      if (FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase())) invalid();
      if (typeof headerValue !== "string" || headerValue.length > DASHBOARD_SECURE_FETCH_HEADER_VALUE_MAX_LENGTH)
        invalid();
      // Reject header injection through embedded newlines.
      if (/[\r\n\0]/.test(headerValue)) invalid();
    }
  }

  if (request.body !== undefined) {
    if (typeof request.body !== "string") invalid();
    if (new TextEncoder().encode(request.body).byteLength > DASHBOARD_SECURE_FETCH_REQUEST_MAX_BYTES) invalid();
  }

  const secret = plainObject(request.secret);
  onlyKeys(secret, ["name", "inject"]);
  if (typeof secret.name !== "string" || !DASHBOARD_SECRET_NAME_PATTERN.test(secret.name)) invalid();
  validateInjection(secret.inject);
}
