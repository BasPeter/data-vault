// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodeStatusResult, VaultApi } from "@/types";
import { OpenCodeChatPopover } from "./opencode-chat-popover";

let container: HTMLDivElement;
let root: Root;
const api = {
  listOpenCodeSessions: vi.fn(async () => []),
  createOpenCodeSession: vi.fn(async () => ({ id: "owned_1", title: "New chat", createdAt: "2026-01-01T00:00:00Z" })),
  openCodeStatus: vi.fn<(sessionId?: string) => Promise<OpenCodeStatusResult>>(async (sessionId?: string) =>
    sessionId ? { state: "idle" } : { state: "ready" },
  ),
  listOpenCodeMessages: vi.fn(async () => []),
  sendOpenCodePrompt: vi.fn(async () => undefined),
  abortOpenCodePrompt: vi.fn(async () => undefined),
  openCodeSetup: vi.fn(async () => undefined),
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.listOpenCodeSessions.mockReset().mockResolvedValue([]);
  api.createOpenCodeSession
    .mockReset()
    .mockResolvedValue({ id: "owned_1", title: "New chat", createdAt: "2026-01-01T00:00:00Z" });
  api.openCodeStatus
    .mockReset()
    .mockImplementation(async (sessionId?: string) =>
      sessionId ? { state: "idle" as const } : { state: "ready" as const },
    );
  api.listOpenCodeMessages.mockReset().mockResolvedValue([]);
  api.sendOpenCodePrompt.mockReset().mockResolvedValue(undefined);
  api.abortOpenCodePrompt.mockReset().mockResolvedValue(undefined);
  api.openCodeSetup.mockReset().mockResolvedValue(undefined);
  window.vaultApi = api as unknown as VaultApi;
});

async function openAndCreate(): Promise<void> {
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click());
  await act(async () =>
    [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("New"))!
      .click(),
  );
}

async function send(text = "Hello"): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Message OpenCode"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  });
  await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!.click());
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function setInput(label: string, value: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  });
}

async function openSetup(): Promise<void> {
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click());
  await act(async () =>
    [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Setup"))!
      .click(),
  );
}

async function fillSetup(): Promise<void> {
  await setInput("OpenCode username", "private-user");
  await setInput("OpenCode password", "private-password");
  const disclosure = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  if (!disclosure.checked) await act(async () => disclosure.click());
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("OpenCodeChatPopover", () => {
  it("opens from its accessible trigger, discloses authority in setup, and restores focus on Escape", async () => {
    await act(async () => root.render(<OpenCodeChatPopover />));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!;
    await act(async () => trigger.click());
    expect(document.body.textContent).toContain("Only chats created in this app window");
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Setup"))!
        .click(),
    );
    expect(document.body.textContent).toContain("may execute commands, read local files and provider credentials");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.textContent).not.toContain("Only chats created in this app window");
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      trigger.click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(document.body.textContent).not.toContain("Only chats created in this app window");
    expect(document.activeElement).toBe(trigger);
  });

  it("defaults the setup username to OpenCode's documented value", async () => {
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openSetup();
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode username"]')!.value).toBe(
      "opencode",
    );
  });

  it.each([
    ["unconfigured", "not configured"],
    ["unavailable", "is unavailable"],
    ["incompatible", "incompatible"],
    ["authentication-failed", "rejected these credentials"],
  ] as const)("shows the typed %s configuration recovery state", async (state, message) => {
    api.openCodeStatus.mockResolvedValueOnce({ state });
    await act(async () => root.render(<OpenCodeChatPopover />));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    expect(document.body.textContent).toContain(message);
    expect(document.body.querySelector('[aria-label="OpenCode setup"]')).not.toBeNull();
  });

  it("shows fixed authentication guidance after setup without leaking remote details", async () => {
    const message = "OpenCode rejected these credentials. Check the username and password.";
    api.openCodeSetup.mockRejectedValueOnce(new Error(message));
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openSetup();
    await fillSetup();
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Save setup"))!
        .click(),
    );
    expect(document.body.textContent).toContain(message);
  });

  it("sanitizes an unexpected setup failure before displaying it", async () => {
    const secret = "password=private-password";
    api.openCodeSetup.mockRejectedValueOnce(new Error(secret));
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openSetup();
    await fillSetup();
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Save setup"))!
        .click(),
    );
    expect(document.body.textContent).toContain("OpenCode is unavailable. Start it separately, then try again.");
    expect(document.body.textContent).not.toContain(secret);
  });

  it("shows only the fixed oversized-transcript message", async () => {
    const secret = "Authorization: Basic private-password";
    api.listOpenCodeMessages.mockRejectedValueOnce(new Error("OpenCode transcript is too large to display."));
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    expect(document.body.textContent).toContain("OpenCode transcript is too large to display.");
    expect(document.body.textContent).not.toContain(secret);
  });

  it("clears plaintext credentials after setup succeeds or fails", async () => {
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openSetup();
    await fillSetup();
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Save setup"))!
        .click(),
    );
    expect(api.openCodeSetup).toHaveBeenCalledWith({
      port: 4096,
      username: "private-user",
      password: "private-password",
      disclosureAccepted: true,
    });

    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Setup"))!
        .click(),
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode username"]')!.value).toBe(
      "opencode",
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode password"]')!.value).toBe("");

    api.openCodeSetup.mockRejectedValueOnce(new Error("OpenCode request failed."));
    await fillSetup();
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Save setup"))!
        .click(),
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode username"]')!.value).toBe(
      "opencode",
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode password"]')!.value).toBe("");
  });

  it("clears plaintext credentials when the popover closes", async () => {
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openSetup();
    await fillSetup();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Setup"))!
        .click(),
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode username"]')!.value).toBe(
      "opencode",
    );
    expect(document.body.querySelector<HTMLInputElement>('input[aria-label="OpenCode password"]')!.value).toBe("");
  });

  it("creates only typed owned sessions and prevents a duplicate prompt while busy", async () => {
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    expect(api.createOpenCodeSession).toHaveBeenCalledWith("New chat");
    await send();
    expect(api.sendOpenCodePrompt).toHaveBeenCalledWith("owned_1", "Hello");
    expect(document.body.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!.disabled).toBe(true);
  });

  it("does not start polling after a deferred prompt resolves while closed", async () => {
    const prompt = deferred<undefined>();
    api.sendOpenCodePrompt.mockReturnValueOnce(prompt.promise);
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    const statusCalls = api.openCodeStatus.mock.calls.length;
    const messageCalls = api.listOpenCodeMessages.mock.calls.length;

    await act(async () => prompt.resolve(undefined));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(statusCalls);
    expect(api.listOpenCodeMessages).toHaveBeenCalledTimes(messageCalls);

    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    expect(document.body.querySelector('input[aria-label="Message OpenCode"]')).toBeNull();
  });

  it("does not start polling after a deferred prompt resolves while unmounted", async () => {
    const prompt = deferred<undefined>();
    api.sendOpenCodePrompt.mockReturnValueOnce(prompt.promise);
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    await act(async () => root.unmount());
    const statusCalls = api.openCodeStatus.mock.calls.length;
    const messageCalls = api.listOpenCodeMessages.mock.calls.length;

    await act(async () => prompt.resolve(undefined));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(statusCalls);
    expect(api.listOpenCodeMessages).toHaveBeenCalledTimes(messageCalls);
  });

  it("disables prompt actions until a selected session's message refresh completes", async () => {
    const messages = deferred<[]>();
    api.listOpenCodeMessages.mockReturnValueOnce(messages.promise);
    await act(async () => root.render(<OpenCodeChatPopover />));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("New"))!
        .click(),
    );

    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="Message OpenCode"]')!;
    const sendButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!;
    expect(input.disabled).toBe(true);
    expect(sendButton.disabled).toBe(true);
    await act(async () => sendButton.click());
    expect(api.sendOpenCodePrompt).not.toHaveBeenCalled();

    await act(async () => messages.resolve([]));
    expect(input.disabled).toBe(false);
  });

  it("polls one second after an accepted prompt, then stops after busy becomes idle", async () => {
    vi.useFakeTimers();
    api.openCodeStatus
      .mockImplementationOnce(async () => ({ state: "ready" as const }))
      .mockResolvedValueOnce({ state: "idle" })
      .mockResolvedValueOnce({ state: "busy" })
      .mockResolvedValueOnce({ state: "idle" });
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    expect(api.openCodeStatus).toHaveBeenCalledTimes(2);
    await act(async () => await vi.advanceTimersByTimeAsync(999));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(2);
    await act(async () => await vi.advanceTimersByTimeAsync(1));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(3);
    await act(async () => await vi.advanceTimersByTimeAsync(1_000));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(4);
    expect(document.body.querySelector('button[aria-label="Abort prompt"]')).toBeNull();
    vi.useRealTimers();
  });

  it("stops polling on abort and close without retaining scheduled refreshes", async () => {
    vi.useFakeTimers();
    api.openCodeStatus
      .mockImplementationOnce(async () => ({ state: "ready" as const }))
      .mockResolvedValueOnce({ state: "idle" })
      .mockResolvedValue({ state: "busy" });
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="Abort prompt"]')!.click());
    expect(api.abortOpenCodePrompt).toHaveBeenCalledWith("owned_1");
    await act(async () => await vi.advanceTimersByTimeAsync(2_000));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(2);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Open OpenCode chat"]')!.click(),
    );
    await act(async () => await vi.advanceTimersByTimeAsync(2_000));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("stops after three consecutive polling failures", async () => {
    vi.useFakeTimers();
    api.openCodeStatus
      .mockImplementationOnce(async () => ({ state: "ready" as const }))
      .mockResolvedValueOnce({ state: "idle" })
      .mockRejectedValue(new Error("OpenCode request failed."));
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    await act(async () => await vi.advanceTimersByTimeAsync(3_000));
    expect(document.body.querySelector('button[aria-label="Abort prompt"]')).toBeNull();
    expect(document.body.textContent).toContain("OpenCode request failed.");
    vi.useRealTimers();
  });

  it("does not poll past the two-minute bound", async () => {
    vi.useFakeTimers();
    api.openCodeStatus
      .mockImplementationOnce(async () => ({ state: "ready" as const }))
      .mockResolvedValueOnce({ state: "idle" })
      .mockResolvedValue({ state: "busy" });
    await act(async () => root.render(<OpenCodeChatPopover />));
    await openAndCreate();
    await send();
    await act(async () => await vi.advanceTimersByTimeAsync(120_000));
    // Configuration + selection + each 1s refresh through 119 seconds.
    expect(api.openCodeStatus).toHaveBeenCalledTimes(121);
    await act(async () => await vi.advanceTimersByTimeAsync(5_000));
    expect(api.openCodeStatus).toHaveBeenCalledTimes(121);
    vi.useRealTimers();
  });
});
