type MermaidRenderer = {
  initialize: (config: { startOnLoad: boolean; theme: "dark" | "default"; securityLevel: "strict" }) => void;
  run: (options: { nodes: HTMLElement[] }) => Promise<void>;
};

type Transform = { x: number; y: number; scale: number };

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;
const KEYBOARD_PAN_STEP = 40;

let renderQueue: Promise<void> = Promise.resolve();
let nextGeneration = 0;

export function normalizeMarkdownMermaid(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>("pre > code.language-mermaid").forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    pre.className = "mermaid";
    pre.textContent = code.textContent ?? "";
  });
}

export function createMermaidGeneration(): string {
  nextGeneration += 1;
  return String(nextGeneration);
}

function ownsGeneration(container: HTMLElement, generation: string): boolean {
  return container.isConnected && container.dataset.mermaidGeneration === generation;
}

function createControl(label: string, text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mermaid-navigation-button";
  button.setAttribute("aria-label", label);
  button.dataset.mermaidNavigation = "true";
  button.textContent = text;
  return button;
}

export function enhanceMermaidDiagram(block: HTMLElement, generation: string): () => void {
  const svg = block.querySelector<SVGSVGElement>("svg");
  if (!svg) return () => {};

  const controls = document.createElement("div");
  controls.className = "mermaid-navigation-controls";
  controls.dataset.mermaidNavigation = "true";
  const zoomIn = createControl("Zoom in diagram", "+");
  const zoomOut = createControl("Zoom out diagram", "−");
  const reset = createControl("Reset diagram view", "↺");
  controls.append(zoomIn, zoomOut, reset);

  const viewport = document.createElement("div");
  viewport.className = "mermaid-navigation-viewport";
  viewport.dataset.mermaidNavigation = "true";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "region");
  viewport.setAttribute("aria-label", "Interactive diagram; use arrow keys to pan");
  viewport.append(svg);
  block.append(controls, viewport);

  let transform: Transform = { x: 0, y: 0, scale: 1 };
  let drag: { pointerId: number; clientX: number; clientY: number; x: number; y: number } | null = null;
  const removers: Array<() => void> = [];

  const listen = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, listener as EventListener, options);
    removers.push(() => target.removeEventListener(type, listener as EventListener, options));
  };

  const apply = () => {
    svg.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    svg.dataset.mermaidX = String(transform.x);
    svg.dataset.mermaidY = String(transform.y);
    svg.dataset.mermaidScale = String(transform.scale);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * factor));
    if (nextScale === transform.scale) return;
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const diagramX = (x - transform.x) / transform.scale;
    const diagramY = (y - transform.y) / transform.scale;
    transform = { x: x - diagramX * nextScale, y: y - diagramY * nextScale, scale: nextScale };
    apply();
  };

  const zoomAtCenter = (factor: number) => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  listen(zoomIn, "click", () => zoomAtCenter(ZOOM_STEP));
  listen(zoomOut, "click", () => zoomAtCenter(1 / ZOOM_STEP));
  listen(reset, "click", () => {
    transform = { x: 0, y: 0, scale: 1 };
    apply();
  });
  listen(viewport, "pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: transform.x,
      y: transform.y,
    };
    viewport.dataset.panning = "true";
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  listen(viewport, "pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    transform = {
      ...transform,
      x: drag.x + event.clientX - drag.clientX,
      y: drag.y + event.clientY - drag.clientY,
    };
    apply();
  });
  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    drag = null;
    delete viewport.dataset.panning;
  };
  listen(viewport, "pointerup", endDrag);
  listen(viewport, "pointercancel", endDrag);
  listen(
    viewport,
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX, event.clientY);
    },
    { passive: false },
  );
  listen(viewport, "keydown", (event) => {
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_PAN_STEP, 0],
      ArrowRight: [KEYBOARD_PAN_STEP, 0],
      ArrowUp: [0, -KEYBOARD_PAN_STEP],
      ArrowDown: [0, KEYBOARD_PAN_STEP],
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    transform = { ...transform, x: transform.x + delta[0], y: transform.y + delta[1] };
    apply();
  });

  apply();
  return () => {
    removers.forEach((remove) => remove());
    if (drag) {
      if (viewport.hasPointerCapture(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
      drag = null;
      delete viewport.dataset.panning;
    }
    if (block.dataset.mermaidGeneration !== generation) return;
    svg.style.removeProperty("transform");
    svg.removeAttribute("data-mermaid-x");
    svg.removeAttribute("data-mermaid-y");
    svg.removeAttribute("data-mermaid-scale");
    controls.remove();
    viewport.replaceWith(svg);
  };
}

export async function renderMermaid(
  container: HTMLElement,
  generation: string,
  theme: "light" | "dark",
  loadRenderer: () => Promise<MermaidRenderer> = async () => (await import("mermaid")).default,
): Promise<() => void> {
  container.dataset.mermaidGeneration = generation;
  const operation = renderQueue.then(async () => {
    if (!ownsGeneration(container, generation)) return () => {};
    const blocks = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));
    if (!blocks.length) return () => {};
    const mermaid = await loadRenderer();
    if (!ownsGeneration(container, generation)) return () => {};
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "strict",
    });
    blocks.forEach((block) => {
      block.dataset.mermaidGeneration = generation;
      block.removeAttribute("data-processed");
    });
    await mermaid.run({ nodes: blocks });
    if (!ownsGeneration(container, generation)) return () => {};
    const cleanups = blocks
      .filter((block) => block.isConnected && block.dataset.mermaidGeneration === generation)
      .map((block) => enhanceMermaidDiagram(block, generation));
    return () => cleanups.forEach((cleanup) => cleanup());
  });
  renderQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
