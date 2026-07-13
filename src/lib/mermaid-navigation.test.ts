// @vitest-environment jsdom
import { marked } from "marked";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitize } from "./sanitize";
import {
  createMermaidGeneration,
  enhanceMermaidDiagram,
  normalizeMarkdownMermaid,
  renderMermaid,
} from "./mermaid-navigation";

function diagram(generation = "test"): { block: HTMLElement; svg: SVGSVGElement } {
  const block = document.createElement("div");
  block.className = "mermaid";
  block.dataset.mermaidGeneration = generation;
  block.innerHTML = '<svg viewBox="0 0 800 400"></svg>';
  document.body.append(block);
  return { block, svg: block.querySelector("svg")! };
}

function pointer(type: string, values: Partial<PointerEvent>): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...values });
  Object.defineProperty(event, "pointerId", { value: values.pointerId ?? 1 });
  return event;
}

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
  });
});

describe("Mermaid navigation", () => {
  it("keeps controls and transforms independent, supports pan and reset, and ignores plain wheel input", () => {
    const first = diagram("first");
    const second = diagram("second");
    enhanceMermaidDiagram(first.block, "first");
    enhanceMermaidDiagram(second.block, "second");

    first.block.querySelector<HTMLButtonElement>('[aria-label="Zoom in diagram"]')!.click();
    expect(Number(first.svg.dataset.mermaidScale)).toBeGreaterThan(1);
    expect(second.svg.dataset.mermaidScale).toBe("1");
    first.block.querySelector<HTMLButtonElement>('[aria-label="Zoom out diagram"]')!.click();
    expect(first.svg.dataset.mermaidScale).toBe("1");

    const zoomIn = first.block.querySelector<HTMLButtonElement>('[aria-label="Zoom in diagram"]')!;
    const zoomOut = first.block.querySelector<HTMLButtonElement>('[aria-label="Zoom out diagram"]')!;
    for (let count = 0; count < 30; count += 1) zoomOut.click();
    expect(first.svg.dataset.mermaidScale).toBe("0.5");
    zoomOut.click();
    expect(first.svg.dataset.mermaidScale).toBe("0.5");
    for (let count = 0; count < 30; count += 1) zoomIn.click();
    expect(first.svg.dataset.mermaidScale).toBe("4");
    zoomIn.click();
    expect(first.svg.dataset.mermaidScale).toBe("4");
    first.block.querySelector<HTMLButtonElement>('[aria-label="Reset diagram view"]')!.click();

    const viewport = first.block.querySelector<HTMLElement>(".mermaid-navigation-viewport")!;
    viewport.dispatchEvent(pointer("pointerdown", { button: 0, pointerId: 7, clientX: 10, clientY: 20 }));
    viewport.dispatchEvent(pointer("pointermove", { pointerId: 7, clientX: 45, clientY: 70 }));
    viewport.dispatchEvent(pointer("pointerup", { pointerId: 7 }));
    expect(Number(first.svg.dataset.mermaidX)).toBeGreaterThan(0);
    expect(Number(first.svg.dataset.mermaidY)).toBeGreaterThan(0);
    expect(viewport.dataset.panning).toBeUndefined();

    viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(Number(first.svg.dataset.mermaidX)).toBeGreaterThan(35);

    const plainWheel = new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true });
    const scaleBeforeWheel = first.svg.dataset.mermaidScale;
    viewport.dispatchEvent(plainWheel);
    expect(plainWheel.defaultPrevented).toBe(false);
    expect(first.svg.dataset.mermaidScale).toBe(scaleBeforeWheel);

    const modifiedWheel = new WheelEvent("wheel", {
      deltaY: -1,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(modifiedWheel);
    expect(modifiedWheel.defaultPrevented).toBe(true);
    expect(Number(first.svg.dataset.mermaidScale)).toBeGreaterThan(Number(scaleBeforeWheel));

    first.block.querySelector<HTMLButtonElement>('[aria-label="Reset diagram view"]')!.click();
    expect(first.svg.dataset).toMatchObject({ mermaidX: "0", mermaidY: "0", mermaidScale: "1" });
  });

  it("ends a captured drag on pointer cancellation and enhancer cleanup", () => {
    const { block, svg } = diagram("capture");
    const cleanup = enhanceMermaidDiagram(block, "capture");
    const viewport = block.querySelector<HTMLElement>(".mermaid-navigation-viewport")!;

    viewport.dispatchEvent(pointer("pointerdown", { button: 0, pointerId: 11, clientX: 5, clientY: 5 }));
    viewport.dispatchEvent(pointer("pointermove", { pointerId: 11, clientX: 25, clientY: 30 }));
    viewport.dispatchEvent(pointer("pointercancel", { pointerId: 11 }));
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(11);
    expect(viewport.dataset.panning).toBeUndefined();
    const xAfterCancel = svg.dataset.mermaidX;
    viewport.dispatchEvent(pointer("pointermove", { pointerId: 11, clientX: 50, clientY: 50 }));
    expect(svg.dataset.mermaidX).toBe(xAfterCancel);

    viewport.dispatchEvent(pointer("pointerdown", { button: 0, pointerId: 12, clientX: 10, clientY: 10 }));
    expect(viewport.dataset.panning).toBe("true");
    cleanup();
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(12);
    expect(viewport.dataset.panning).toBeUndefined();
    expect(block.querySelector(".mermaid-navigation-controls")).toBeNull();
    expect(block.firstElementChild).toBe(svg);
  });

  it.each([
    [
      "HTML",
      '<button id="vault-lookalike" class="mermaid-navigation-button" aria-label="Zoom in diagram" onclick="alert(1)">fake</button><pre class="mermaid">graph TD; HTML-->Safe</pre>',
      false,
    ],
    [
      "Markdown",
      '<button id="vault-lookalike" class="mermaid-navigation-button" aria-label="Zoom in diagram" onclick="alert(1)">fake</button>\n\n```mermaid\ngraph TD; Markdown-->Safe\n```',
      true,
    ],
  ])("sanitizes and renders adversarial %s through the strict production boundary", async (_kind, source, markdown) => {
    const order: string[] = [];
    const html = markdown ? String(await marked.parse(source)) : source;
    const container = document.createElement("div");
    container.innerHTML = sanitize(html);
    order.push("sanitize");
    if (markdown) {
      normalizeMarkdownMermaid(container);
      order.push("normalize");
    }
    document.body.append(container);
    const fake = container.querySelector<HTMLButtonElement>("#vault-lookalike")!;
    expect(fake.getAttribute("onclick")).toBeNull();
    const initialize = vi.fn(() => order.push("initialize"));
    const run = vi.fn(async ({ nodes }: { nodes: HTMLElement[] }) => {
      order.push("run");
      expect(nodes).toHaveLength(1);
      expect(nodes[0].textContent).toMatch(markdown ? /Markdown-->Safe/ : /HTML-->Safe/);
      expect(container.querySelector("[data-mermaid-navigation]")).toBeNull();
      nodes[0].innerHTML = '<svg data-renderer-output="true"></svg>';
      order.push("svg-output");
    });

    await renderMermaid(container, createMermaidGeneration(), "dark", async () => ({ initialize, run }));
    order.push("enhanced");

    expect(initialize).toHaveBeenCalledWith({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
    expect(order).toEqual(
      markdown
        ? ["sanitize", "normalize", "initialize", "run", "svg-output", "enhanced"]
        : ["sanitize", "initialize", "run", "svg-output", "enhanced"],
    );
    fake.click();
    expect(fake.dataset.mermaidNavigation).toBeUndefined();
    expect(fake.closest(".mermaid-navigation-viewport")).toBeNull();
    const generated = container.querySelectorAll<HTMLButtonElement>(".mermaid button[data-mermaid-navigation]");
    expect(generated).toHaveLength(3);
    expect(generated[0].getAttribute("aria-label")).toBe("Zoom in diagram");
    expect(container.querySelector<SVGSVGElement>('svg[data-renderer-output="true"]')?.dataset.mermaidScale).toBe("1");
  });

  it("adds no controls when Mermaid completes without producing an SVG", async () => {
    const container = document.createElement("div");
    container.innerHTML = sanitize('<pre class="mermaid">graph TD; A-->B</pre>');
    document.body.append(container);
    const renderer = { initialize: vi.fn(), run: vi.fn(async () => undefined) };

    await renderMermaid(container, createMermaidGeneration(), "light", async () => renderer);

    expect(renderer.run).toHaveBeenCalledOnce();
    expect(container.querySelector(".mermaid-navigation-controls")).toBeNull();
    expect(container.querySelector(".mermaid-navigation-viewport")).toBeNull();
  });

  it("serializes interleaved generations and enhances only the current theme generation", async () => {
    let releaseFirst!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let runs = 0;
    const initialize = vi.fn();
    const renderer = {
      initialize,
      run: vi.fn(async ({ nodes }: { nodes: HTMLElement[] }) => {
        runs += 1;
        if (runs === 1) await firstRun;
        nodes.forEach((node) => (node.innerHTML = "<svg></svg>"));
      }),
    };
    const load = async () => renderer;
    const container = document.createElement("div");
    container.innerHTML = '<div class="mermaid">graph TD; A-->B</div>';
    document.body.append(container);

    const firstGeneration = createMermaidGeneration();
    const first = renderMermaid(container, firstGeneration, "light", load);
    await vi.waitFor(() => expect(renderer.run).toHaveBeenCalledTimes(1));
    container.innerHTML = '<div class="mermaid">graph TD; B-->C</div>';
    const currentBlock = container.firstElementChild;
    const second = renderMermaid(container, createMermaidGeneration(), "dark", load);
    releaseFirst();
    await Promise.all([first, second]);

    expect(renderer.run).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenLastCalledWith({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
    expect(container.querySelectorAll(".mermaid-navigation-controls")).toHaveLength(1);
    expect(currentBlock?.querySelector(".mermaid-navigation-controls")).not.toBeNull();
  });

  it("settles a failed queued render so a subsequent valid generation renders", async () => {
    const failedContainer = document.createElement("div");
    failedContainer.innerHTML = '<div class="mermaid">invalid</div>';
    const validContainer = document.createElement("div");
    validContainer.innerHTML = '<div class="mermaid">graph TD; A-->B</div>';
    document.body.append(failedContainer, validContainer);
    let runs = 0;
    const renderer = {
      initialize: vi.fn(),
      run: vi.fn(async ({ nodes }: { nodes: HTMLElement[] }) => {
        runs += 1;
        if (runs === 1) throw new Error("Malformed Mermaid source");
        nodes.forEach((node) => (node.innerHTML = "<svg></svg>"));
      }),
    };
    const load = async () => renderer;

    await expect(renderMermaid(failedContainer, createMermaidGeneration(), "light", load)).rejects.toThrow(
      "Malformed Mermaid source",
    );
    await expect(renderMermaid(validContainer, createMermaidGeneration(), "dark", load)).resolves.toEqual(
      expect.any(Function),
    );
    expect(validContainer.querySelectorAll(".mermaid-navigation-controls")).toHaveLength(1);
    expect(renderer.initialize).toHaveBeenLastCalledWith({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
    });
  });
});
