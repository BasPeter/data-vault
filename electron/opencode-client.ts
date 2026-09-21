export const OPENCODE_TIMEOUT_MS = 10_000;
export const OPENCODE_MAX_RESPONSE_BYTES = 262_144;
export const OPENCODE_TRANSCRIPT_PAGE_LIMIT = 20;

export type OpenCodeCredentials = Readonly<{ port: number; username: string; password: string }>;
export type OpenCodeSession = Readonly<{ id: string; title: string; createdAt: string }>;
export type OpenCodeMessage = Readonly<{ id: string; role: "user" | "assistant"; text: string; createdAt: string }>;
export type OpenCodeStatus = Readonly<{ state: "busy" | "idle" }>;

export class OpenCodeClientError extends Error {
  constructor(
    message = "OpenCode request failed.",
    readonly code: "unavailable" | "incompatible" | "authentication-failed" | "transcript-too-large" = "unavailable",
  ) {
    super(message);
    this.name = "OpenCodeClientError";
  }
}

function failed(): never {
  throw new OpenCodeClientError();
}

export function validateOpenCodePort(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) failed();
  return value;
}

function validString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return (
    validString(value, 1, 40) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function normalizeRemoteTimestamp(value: unknown): string | undefined {
  if (validTimestamp(value)) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(value)) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const normalized = date.toISOString();
  return validTimestamp(normalized) ? normalized : undefined;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasSafeNesting(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value)) return value.every((entry) => hasSafeNesting(entry, depth + 1));
  const record = object(value);
  return !record || Object.values(record).every((entry) => hasSafeNesting(entry, depth + 1));
}

function versionAtLeastMinimum(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );
  if (!match) return false;
  const current = [Number(match[1]), Number(match[2]), Number(match[3])];
  const minimum = [1, 1, 10];
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== minimum[index]) return current[index] > minimum[index];
  }
  return !value.includes("-");
}

async function readJson(
  response: Response,
  overflowCode: OpenCodeClientError["code"] = "unavailable",
): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) failed();
  const stream = response.body;
  if (!stream) failed();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (total + value.byteLength > OPENCODE_MAX_RESPONSE_BYTES) {
        throw new OpenCodeClientError("OpenCode request failed.", overflowCode);
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))));
  } catch {
    failed();
  }
  if (!hasSafeNesting(parsed)) failed();
  return parsed;
}

function sessionFrom(value: unknown): OpenCodeSession {
  const record = object(value);
  const createdAt = normalizeRemoteTimestamp(object(record?.time)?.created);
  if (!record || !validId(record.id) || !validString(record.title, 0, 120) || !createdAt) failed();
  return { id: record.id, title: record.title, createdAt };
}

function messageFrom(value: unknown): OpenCodeMessage | undefined {
  const record = object(value);
  const info = object(record?.info);
  const createdAt = normalizeRemoteTimestamp(object(info?.time)?.created);
  if (!info || !validId(info.id) || !createdAt) failed();
  if (info.role !== "user" && info.role !== "assistant") return undefined;
  if (!Array.isArray(record?.parts)) failed();
  const textPart = record.parts.find((part) => object(part)?.type === "text");
  if (!textPart) return undefined;
  const text = object(textPart)?.text;
  if (!validString(text, 0, 8000)) failed();
  return { id: info.id, role: info.role, text, createdAt };
}

export class OpenCodeClient {
  private readonly origin: string;
  private readonly authorization: string;

  constructor(
    credentials: OpenCodeCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const port = validateOpenCodePort(credentials.port);
    if (!validString(credentials.username, 1, 256) || !validString(credentials.password, 1, 1024)) failed();
    this.origin = `http://127.0.0.1:${port}`;
    this.authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`, "utf8").toString("base64")}`;
  }

  async health(): Promise<void> {
    await this.healthVersion();
  }

  async healthVersion(): Promise<string> {
    const health = await this.json("/global/health", "GET");
    const record = object(health);
    if (!record || record.healthy !== true || !versionAtLeastMinimum(record.version)) {
      throw new OpenCodeClientError("OpenCode is unavailable.", "incompatible");
    }
    return record.version as string;
  }

  async createSession(title = "", signal?: AbortSignal): Promise<OpenCodeSession> {
    if (!validString(title, 0, 120)) failed();
    return sessionFrom(await this.json("/session", "POST", { title }, signal));
  }

  async status(id: unknown, signal?: AbortSignal): Promise<OpenCodeStatus> {
    const validSessionId = this.sessionId(id);
    const statuses = object(await this.json("/session/status", "GET", undefined, signal));
    if (!statuses) failed();
    if (!Object.hasOwn(statuses, validSessionId)) return { state: "idle" };
    const status = object(statuses[validSessionId]);
    if (!status) failed();
    if (status.type === "busy" || status.type === "retry") return { state: "busy" };
    if (status.type === "idle") return { state: "idle" };
    failed();
  }

  async messages(id: unknown, signal?: AbortSignal): Promise<OpenCodeMessage[]> {
    const validSessionId = this.sessionId(id);
    const response = await this.json(
      `/session/${validSessionId}/message?limit=${OPENCODE_TRANSCRIPT_PAGE_LIMIT}`,
      "GET",
      undefined,
      signal,
      "transcript-too-large",
    );
    if (!Array.isArray(response) || response.length > 100) failed();
    return response.map(messageFrom).filter((message): message is OpenCodeMessage => message !== undefined);
  }

  async sendPrompt(id: unknown, prompt: unknown, messageId?: unknown, signal?: AbortSignal): Promise<void> {
    const validSessionId = this.sessionId(id);
    if (!validString(prompt, 1, 8000)) failed();
    if (messageId !== undefined && !validId(messageId)) failed();
    await this.empty(
      `/session/${validSessionId}/prompt_async`,
      "POST",
      { parts: [{ type: "text", text: prompt }], ...(messageId === undefined ? {} : { messageID: messageId }) },
      signal,
    );
  }

  async abort(id: unknown, signal?: AbortSignal): Promise<void> {
    await this.json(`/session/${this.sessionId(id)}/abort`, "POST", undefined, signal);
  }

  private sessionId(value: unknown): string {
    if (!validId(value)) failed();
    return value;
  }

  private async json(
    route: string,
    method: "GET" | "POST",
    body?: unknown,
    signal?: AbortSignal,
    overflowCode: OpenCodeClientError["code"] = "unavailable",
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.origin}${route}`, {
        method,
        headers: {
          authorization: this.authorization,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: signal
          ? AbortSignal.any([AbortSignal.timeout(OPENCODE_TIMEOUT_MS), signal])
          : AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 403) {
        throw new OpenCodeClientError("OpenCode request failed.", "authentication-failed");
      }
      if (response.status !== 200) failed();
      return await readJson(response, overflowCode);
    } catch (error) {
      if (error instanceof OpenCodeClientError) throw error;
      failed();
    }
  }

  private async empty(route: string, method: "POST", body: unknown, signal?: AbortSignal): Promise<void> {
    try {
      const response = await this.fetchImpl(`${this.origin}${route}`, {
        method,
        headers: { authorization: this.authorization, "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: signal
          ? AbortSignal.any([AbortSignal.timeout(OPENCODE_TIMEOUT_MS), signal])
          : AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
      });
      if (response.status !== 204 || response.body !== null) failed();
    } catch (error) {
      if (error instanceof OpenCodeClientError) throw error;
      failed();
    }
  }
}
