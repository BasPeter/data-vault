import { describe, expect, it, vi } from "vitest";
import {
  DashboardExternalLinkPromptGate,
  DASHBOARD_EXTERNAL_LINK_MAX_PROMPTS_PER_MINUTE,
} from "./dashboard-external-link-flow";

describe("dashboard external-link trusted prompt gate", () => {
  it("launches only after the trusted confirmation and re-authentication", async () => {
    const gate = new DashboardExternalLinkPromptGate();
    const confirmed = vi.fn(async () => true);
    const authenticated = vi.fn();
    const launched = vi.fn(async () => undefined);

    await expect(gate.request(confirmed, authenticated, launched)).resolves.toBe(true);
    expect(authenticated).toHaveBeenCalledOnce();
    expect(launched).toHaveBeenCalledOnce();
  });

  it("does not launch after cancellation, teardown, authentication failure, or concurrent prompt", async () => {
    const gate = new DashboardExternalLinkPromptGate();
    const launch = vi.fn(async () => undefined);
    await expect(
      gate.request(
        async () => false,
        () => undefined,
        launch,
      ),
    ).resolves.toBe(false);

    let resolveConfirmation!: (value: boolean) => void;
    const pending = gate.request(
      () => new Promise((resolve) => (resolveConfirmation = resolve)),
      () => undefined,
      launch,
    );
    await expect(
      gate.request(
        async () => true,
        () => undefined,
        launch,
      ),
    ).resolves.toBe(false);
    gate.cancel();
    resolveConfirmation(true);
    await expect(pending).resolves.toBe(false);
    await expect(
      gate.request(
        async () => true,
        () => {
          throw new Error("stale sender");
        },
        launch,
      ),
    ).resolves.toBe(false);
    expect(launch).not.toHaveBeenCalled();
  });

  it("rate limits trusted prompts", async () => {
    const gate = new DashboardExternalLinkPromptGate();
    const launch = vi.fn(async () => undefined);
    for (let index = 0; index < DASHBOARD_EXTERNAL_LINK_MAX_PROMPTS_PER_MINUTE; index += 1) {
      await expect(
        gate.request(
          async () => false,
          () => undefined,
          launch,
          1,
        ),
      ).resolves.toBe(false);
    }
    await expect(
      gate.request(
        async () => true,
        () => undefined,
        launch,
        1,
      ),
    ).resolves.toBe(false);
    expect(launch).not.toHaveBeenCalled();
  });
});
