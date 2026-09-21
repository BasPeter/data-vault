import {
  OpenCodeClientError,
  type OpenCodeCredentials,
  type OpenCodeMessage,
  type OpenCodeSession,
  type OpenCodeStatus,
} from "./opencode-client";
import type { OpenCodeSetupInput } from "./opencode-credentials";
import type { OpenCodeStreamController } from "./opencode-stream-controller";

type Frame = object;
type OpenCodeOperations = {
  createSession: (title?: string, signal?: AbortSignal) => Promise<OpenCodeSession>;
  status: (id: unknown, signal?: AbortSignal) => Promise<OpenCodeStatus>;
  messages: (id: unknown, signal?: AbortSignal) => Promise<OpenCodeMessage[]>;
  sendPrompt: (id: unknown, prompt: unknown, messageId?: unknown, signal?: AbortSignal) => Promise<void>;
  abort: (id: unknown, signal?: AbortSignal) => Promise<void>;
};

export type OpenCodeConfigurationState =
  | "unconfigured"
  | "ready"
  | "unavailable"
  | "incompatible"
  | "authentication-failed"
  | "secure-storage-unavailable";
export type OpenCodeConfigurationStatus = Readonly<{ state: OpenCodeConfigurationState }>;
type OpenCodeConfiguration = OpenCodeConfigurationStatus & Readonly<{ credentials?: OpenCodeCredentials }>;

export type OpenCodeControllerDependencies = Readonly<{
  setup: (input: OpenCodeSetupInput) => Promise<void>;
  removeSetup: () => void;
  client: (credentials: OpenCodeCredentials) => OpenCodeOperations;
  configuration?: () => Promise<OpenCodeConfiguration>;
  streamController?: OpenCodeStreamController;
  streamingSupported?: () => boolean | Promise<boolean>;
  messageId?: () => string;
}>;

type FrameState = {
  generation: number;
  client?: OpenCodeOperations;
  sessions: Map<string, OpenCodeSession>;
  busySessions: Set<string>;
  inFlight: number;
  sessionInFlight: Set<string>;
  abortController: AbortController;
};

const FAILED = "OpenCode request failed.";
const TRANSCRIPT_TOO_LARGE = "OpenCode transcript is too large to display.";
const MAX_SESSIONS = 20;
const MAX_MESSAGES = 100;
const MAX_FRAME_REQUESTS = 4;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function setupError(error: unknown): OpenCodeClientError {
  if (error instanceof OpenCodeClientError) {
    switch (error.code) {
      case "authentication-failed":
        return new OpenCodeClientError(
          "OpenCode rejected these credentials. Check the username and password.",
          error.code,
        );
      case "incompatible":
        return new OpenCodeClientError(
          "This OpenCode version is incompatible. Update OpenCode, then try again.",
          error.code,
        );
      case "unavailable":
        return new OpenCodeClientError("OpenCode is unavailable. Start it separately, then try again.", error.code);
    }
  }
  return new OpenCodeClientError(FAILED);
}

function configurationState(
  error: unknown,
): Exclude<OpenCodeConfigurationState, "unconfigured" | "ready" | "secure-storage-unavailable"> {
  if (!(error instanceof OpenCodeClientError)) return "unavailable";
  return error.code === "transcript-too-large" ? "unavailable" : error.code;
}

function failed(): never {
  throw new OpenCodeClientError(FAILED);
}

function validText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function validTimestamp(value: unknown): value is string {
  return validText(value, 1, 40) && TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function validSetup(value: unknown): value is OpenCodeSetupInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    Number.isInteger(input.port) &&
    (input.port as number) >= 1 &&
    (input.port as number) <= 65535 &&
    validText(input.username, 1, 256) &&
    validText(input.password, 1, 1024) &&
    input.disclosureAccepted === true
  );
}

function validSession(value: unknown): value is OpenCodeSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return (
    Object.keys(session).length === 3 &&
    validId(session.id) &&
    validText(session.title, 0, 120) &&
    validTimestamp(session.createdAt)
  );
}

function validMessage(value: unknown): value is OpenCodeMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    Object.keys(message).length === 4 &&
    validId(message.id) &&
    (message.role === "user" || message.role === "assistant") &&
    validText(message.text, 0, 8000) &&
    validTimestamp(message.createdAt)
  );
}

function validStatus(value: unknown): value is OpenCodeStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    ((value as Record<string, unknown>).state === "busy" || (value as Record<string, unknown>).state === "idle")
  );
}

/** Main-process-only current-window OpenCode grants. Nothing here is persisted. */
export class OpenCodeController {
  private readonly frames = new Map<Frame, FrameState>();

  constructor(private readonly dependencies: OpenCodeControllerDependencies) {}

  async setup(frame: Frame, input: unknown): Promise<void> {
    if (!validSetup(input)) failed();
    // A replacement must never retain authority from the preceding credentials.
    this.invalidate(frame);
    const state = this.state(frame);
    try {
      await this.dependencies.setup(input);
      if (!this.active(frame, state)) failed();
      state.client = this.dependencies.client(input);
    } catch (error) {
      throw setupError(error);
    }
  }

  removeSetup(frame: Frame): void {
    this.invalidate(frame);
    try {
      this.dependencies.removeSetup();
    } catch {
      failed();
    }
  }

  listSessions(frame: Frame): OpenCodeSession[] {
    return [...this.state(frame).sessions.values()];
  }

  async createSession(frame: Frame, title: unknown = ""): Promise<OpenCodeSession> {
    if (!validText(title, 0, 120)) failed();
    const state = this.configured(frame);
    if (state.sessions.size >= MAX_SESSIONS) failed();
    const created = await this.request(frame, state, undefined, (signal) => state.client.createSession(title, signal));
    if (!validSession(created) || state.sessions.has(created.id)) failed();
    state.sessions.set(created.id, created);
    return created;
  }

  async status(frame: Frame, id: unknown): Promise<OpenCodeStatus> {
    if (!validId(id)) failed();
    const state = this.configured(frame);
    if (!state.sessions.has(id)) failed();
    const result = await this.request(frame, state, id, async (signal) => {
      const result = await state.client.status(id, signal);
      if (!validStatus(result)) failed();
      return result;
    });
    if (result.state === "busy") state.busySessions.add(id);
    else state.busySessions.delete(id);
    return result;
  }

  async configurationStatus(frame: Frame): Promise<OpenCodeConfigurationStatus> {
    const state = this.state(frame);
    let configuration: OpenCodeConfiguration | undefined;
    try {
      configuration = await this.dependencies.configuration?.();
    } catch (error) {
      return { state: configurationState(error) };
    }
    if (!this.active(frame, state)) failed();
    const result = configuration ?? { state: "unconfigured" as const };
    if (result.state === "ready" && result.credentials) state.client = this.dependencies.client(result.credentials);
    return { state: result.state };
  }

  async messages(frame: Frame, id: unknown): Promise<OpenCodeMessage[]> {
    return this.sessionRequest(frame, id, async (client, sessionId, signal) => {
      const result = await client.messages(sessionId, signal);
      if (!Array.isArray(result) || result.length > MAX_MESSAGES || !result.every(validMessage)) failed();
      return result;
    });
  }

  async sendPrompt(frame: Frame, id: unknown, prompt: unknown): Promise<void> {
    if (!validText(prompt, 1, 8000)) failed();
    if (!validId(id)) failed();
    const state = this.configured(frame);
    if (!state.sessions.has(id) || state.busySessions.has(id)) failed();
    const messageId = this.dependencies.messageId?.() ?? `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    if (!validId(messageId)) failed();
    await this.request(frame, state, id, (signal) => state.client.sendPrompt(id, prompt, messageId, signal));
    if ((await this.dependencies.streamingSupported?.()) === true && this.active(frame, state)) {
      this.dependencies.streamController?.start(frame, { sessionId: id, userMessageId: messageId });
    }
  }

  async abort(frame: Frame, id: unknown): Promise<void> {
    if (!validId(id)) failed();
    const state = this.configured(frame);
    if (!state.sessions.has(id)) failed();
    await this.request(frame, state, id, (signal) => state.client.abort(id, signal));
    state.busySessions.delete(id);
    this.dependencies.streamController?.stop(frame);
  }

  invalidate(frame: Frame): void {
    const prior = this.frames.get(frame);
    prior?.abortController.abort();
    this.dependencies.streamController?.stop(frame);
    this.frames.set(frame, {
      generation: (prior?.generation ?? 0) + 1,
      sessions: new Map(),
      busySessions: new Set(),
      inFlight: 0,
      sessionInFlight: new Set(),
      abortController: new AbortController(),
    });
  }

  private state(frame: Frame): FrameState {
    let state = this.frames.get(frame);
    if (!state) {
      state = {
        generation: 0,
        sessions: new Map(),
        busySessions: new Set(),
        inFlight: 0,
        sessionInFlight: new Set(),
        abortController: new AbortController(),
      };
      this.frames.set(frame, state);
    }
    return state;
  }

  private configured(frame: Frame): FrameState & { client: OpenCodeOperations } {
    const state = this.state(frame);
    if (!state.client) failed();
    return state as FrameState & { client: OpenCodeOperations };
  }

  private async sessionRequest<T>(
    frame: Frame,
    id: unknown,
    operation: (client: OpenCodeOperations, id: string, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!validId(id)) failed();
    const state = this.configured(frame);
    if (!state.sessions.has(id)) failed();
    return this.request(frame, state, id, (signal) => operation(state.client, id, signal));
  }

  private active(frame: Frame, state: FrameState): boolean {
    return this.frames.get(frame) === state && !state.abortController.signal.aborted;
  }

  private async request<T>(
    frame: Frame,
    state: FrameState,
    id: string | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (state.inFlight >= MAX_FRAME_REQUESTS || (id !== undefined && state.sessionInFlight.has(id))) failed();
    state.inFlight += 1;
    if (id !== undefined) state.sessionInFlight.add(id);
    try {
      const result = await operation(state.abortController.signal);
      if (!this.active(frame, state)) failed();
      return result;
    } catch (error) {
      if (error instanceof OpenCodeClientError && error.code === "transcript-too-large") {
        throw new OpenCodeClientError(TRANSCRIPT_TOO_LARGE, error.code);
      }
      throw new OpenCodeClientError(FAILED);
    } finally {
      state.inFlight -= 1;
      if (id !== undefined) state.sessionInFlight.delete(id);
    }
  }
}
