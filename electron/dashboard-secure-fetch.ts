import {
  DASHBOARD_SCHEMA_VERSION,
  DASHBOARD_SECURE_FETCH_HEADER_VALUE_MAX_LENGTH,
  DASHBOARD_SECURE_FETCH_RESPONSE_HEADER_MAX_COUNT,
  DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES,
  DASHBOARD_SECURE_FETCH_TIMEOUT_MS,
  type DashboardManifest,
  type DashboardSecretDeclaration,
  type DashboardSecureFetchInput,
  type DashboardSecureFetchResult,
} from "../src/dashboard-contracts";
import { validatePreloadSecureFetchInput } from "./dashboard-preload-validation";

/**
 * Response headers that carry session material. They are never useful to a
 * dashboard and must not be handed to untrusted code.
 */
const DROPPED_RESPONSE_HEADERS = new Set(["set-cookie", "set-cookie2", "proxy-authenticate", "www-authenticate"]);

export class DashboardSecretUnsetError extends Error {
  constructor() {
    super("Dashboard secret is not set.");
    this.name = "DashboardSecretUnsetError";
  }
}

export type DashboardSecureFetchDependencies = Readonly<{
  /**
   * Resolves the plaintext secret. The returned value is used only to build the
   * outgoing request and must never be returned, logged, or included in an error.
   */
  resolveSecret: (name: string) => string | undefined;
  fetchImpl?: typeof fetch;
}>;

function denied(): never {
  throw new Error("Dashboard access denied.");
}

function invalid(): never {
  throw new Error("Invalid dashboard API request.");
}

function declarationFor(manifest: DashboardManifest, name: string): DashboardSecretDeclaration {
  const declaration = manifest.secrets?.find((entry) => entry.name === name);
  if (!declaration) denied();
  return declaration;
}

/**
 * Rejects any URL that is not an exact, credential-free HTTPS origin the manifest
 * declared for this secret. This is what stops a hostile dashboard from asking the
 * host to deliver the secret to an attacker-chosen destination.
 */
function resolveTarget(declaration: DashboardSecretDeclaration, rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    invalid();
  }
  if (url.protocol !== "https:") denied();
  if (url.username !== "" || url.password !== "") denied();
  if (!declaration.origins.includes(url.origin)) denied();
  return url;
}

function applyInjection(url: URL, headers: Headers, input: DashboardSecureFetchInput, secretValue: string): void {
  const inject = input.secret.inject;
  if (inject.kind === "authorization-bearer") {
    if (headers.has("authorization")) invalid();
    headers.set("authorization", `Bearer ${secretValue}`);
    return;
  }
  if (inject.kind === "header") {
    if (headers.has(inject.header)) invalid();
    headers.set(inject.header, secretValue);
    return;
  }
  if (url.searchParams.has(inject.param)) invalid();
  url.searchParams.set(inject.param, secretValue);
}

async function readBoundedBody(response: Response, limit: number): Promise<{ body: string; truncated: boolean }> {
  const stream = response.body;
  if (!stream) return { body: "", truncated: false };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = limit - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {
      // The remote may already have closed the stream.
    });
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(merged), truncated };
}

/**
 * Every form the secret can mechanically come back in. Redaction is by value
 * rather than by a header blocklist because a remote echoes an injected value
 * mechanically — most importantly a redirect `Location` preserving the query
 * string the host wrote the secret into. That echo is percent-encoded by
 * `URLSearchParams`, so matching only the literal would miss any secret
 * containing `+`, `/`, `=`, or a space — i.e. most real tokens.
 */
function secretVariants(secretValue: string): string[] {
  const params = new URLSearchParams();
  params.set("v", secretValue);
  const variants = new Set([secretValue, encodeURIComponent(secretValue), params.toString().slice(2)]);
  // Longest first so a shorter variant cannot partially consume a longer match.
  return [...variants].filter((variant) => variant.length > 0).sort((left, right) => right.length - left.length);
}

function redact(value: string, variants: readonly string[]): string {
  let result = value;
  for (const variant of variants) result = result.split(variant).join("[redacted]");
  return result;
}

function boundedResponseHeaders(response: Response, variants: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  let count = 0;
  for (const [name, value] of response.headers) {
    if (DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    if (count >= DASHBOARD_SECURE_FETCH_RESPONSE_HEADER_MAX_COUNT) break;
    // Redact before truncating, so a secret straddling the cut cannot survive as
    // a readable prefix.
    headers[name] = redact(value, variants).slice(0, DASHBOARD_SECURE_FETCH_HEADER_VALUE_MAX_LENGTH);
    count += 1;
  }
  return headers;
}

/**
 * Performs an outbound request on a dashboard's behalf with a declared secret
 * injected by the host. The caller is responsible for having already checked the
 * `secrets:use` capability.
 */
export async function performDashboardSecureFetch(
  manifest: DashboardManifest,
  rawRequest: unknown,
  dependencies: DashboardSecureFetchDependencies,
): Promise<DashboardSecureFetchResult> {
  validatePreloadSecureFetchInput(rawRequest);
  const input = rawRequest;

  const declaration = declarationFor(manifest, input.secret.name);
  const url = resolveTarget(declaration, input.url);

  const headers = new Headers();
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    headers.set(name, value);
  }

  const secretValue = dependencies.resolveSecret(input.secret.name);
  if (secretValue === undefined) throw new DashboardSecretUnsetError();
  applyInjection(url, headers, input, secretValue);

  const run = dependencies.fetchImpl ?? fetch;
  try {
    const response = await run(url, {
      method: input.method,
      headers,
      body: input.body,
      // A redirect must never carry the injected secret to an undeclared origin.
      redirect: "manual",
      signal: AbortSignal.timeout(DASHBOARD_SECURE_FETCH_TIMEOUT_MS),
    });

    // Reading the body stays inside this catch: a mid-body reset, decode failure,
    // or timeout rejects with an error whose cause can embed the request.
    const variants = secretVariants(secretValue);
    // Slack is sized from the LONGEST variant, not the raw secret: the encoded
    // forms run up to three times longer, and a shorter slack leaves a prefix.
    const slack = Math.max(...variants.map((variant) => variant.length));
    const { body, truncated } = await readBoundedBody(response, DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES + slack);
    const redactedBody = redact(body, variants);
    // A cut stream can leave a partial variant as a suffix, which redaction can
    // never match. Drop the whole slack region — the residual is always shorter
    // than `slack` and always at the end, so this removes it entirely. Done in
    // string length, not bytes: the read limit is in bytes, and a multi-byte body
    // would otherwise never trip a byte-sized length check and go unsliced.
    const capped = truncated ? redactedBody.slice(0, Math.max(0, redactedBody.length - slack)) : redactedBody;
    const overflowed = capped.length > DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES;
    return {
      schemaVersion: DASHBOARD_SCHEMA_VERSION,
      status: response.status,
      headers: boundedResponseHeaders(response, variants),
      body: overflowed ? capped.slice(0, DASHBOARD_SECURE_FETCH_RESPONSE_MAX_BYTES) : capped,
      truncated: truncated || overflowed,
    };
  } catch {
    throw new Error("Dashboard request failed.");
  }
}
