import { describe, expect, it, vi } from "vitest";
import { DashboardExternalLinkPromptGate } from "./dashboard-external-link-flow";
import { DashboardRuntimeController } from "./dashboard-runtime";

type ControllerTestSeam = Pick<DashboardRuntimeController, "handleApiCall"> & {
  runtime: {
    active: boolean;
    generation: symbol;
    contents: { id: number; isDestroyed: () => boolean; mainFrame: object };
    senderId: number;
    source: object;
    snapshot: { digest: string };
    externalLinkPromptGate: DashboardExternalLinkPromptGate;
  };
  authority: Map<number, symbol>;
  services: {
    permissions: () => { capabilities: [] };
    confirmExternalLink: ReturnType<typeof vi.fn>;
    openExternalLink: ReturnType<typeof vi.fn>;
  };
};

function controllerForExternalLinkTest() {
  const frame = {};
  const contents = {
    id: 41,
    isDestroyed: () => false,
    mainFrame: frame,
  };
  const generation = Symbol("dashboard-runtime");
  const runtime = {
    active: true,
    generation,
    contents,
    senderId: contents.id,
    source: {},
    snapshot: { digest: "test-digest" },
    externalLinkPromptGate: new DashboardExternalLinkPromptGate(),
  };
  const confirmExternalLink = vi.fn(async () => true);
  const openExternalLink = vi.fn(async () => undefined);
  const controller = Object.create(DashboardRuntimeController.prototype) as unknown as ControllerTestSeam;
  controller.runtime = runtime;
  controller.authority = new Map([[contents.id, generation]]);
  controller.services = {
    permissions: () => ({ capabilities: [] }),
    confirmExternalLink,
    openExternalLink,
  };
  return {
    controller,
    runtime,
    event: { sender: contents, senderFrame: frame },
    confirmExternalLink,
    openExternalLink,
  };
}

describe("DashboardRuntimeController external links", () => {
  it("passes the exact complete canonical URL to trusted confirmation before launch", async () => {
    const { controller, event, confirmExternalLink, openExternalLink } = controllerForExternalLinkTest();
    const url = "https://example.com/path?complete=destination#fragment";

    await expect(controller.handleApiCall(event as never, "open-external-link", { url })).resolves.toEqual({
      opened: true,
    });

    expect(confirmExternalLink).toHaveBeenCalledWith(url);
    expect(openExternalLink).toHaveBeenCalledWith(url);
  });

  it("does not launch after its authenticated runtime changes during confirmation", async () => {
    const { controller, runtime, event, confirmExternalLink, openExternalLink } = controllerForExternalLinkTest();
    let resolveConfirmation!: (value: boolean) => void;
    confirmExternalLink.mockImplementationOnce(() => new Promise((resolve) => (resolveConfirmation = resolve)));

    const request = controller.handleApiCall(event as never, "open-external-link", { url: "https://example.com/" });
    runtime.active = false;
    controller.authority.clear();
    resolveConfirmation(true);

    await expect(request).resolves.toEqual({ opened: false });
    expect(openExternalLink).not.toHaveBeenCalled();
  });
});
