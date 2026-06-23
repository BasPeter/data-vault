import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphData, GraphNode } from "@/types";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;

// Folder → colour. Works on both light and dark backgrounds.
const FOLDER_COLORS: Record<string, string> = {
  "10-kennisbank": "#60a5fa",
  "20-aantekeningen": "#34d399",
  "30-projecten": "#f59e0b",
  "(root)": "#a78bfa",
};
const FALLBACK_COLORS = ["#f472b6", "#22d3ee", "#a3e635", "#fb923c"];

function colorFor(folder: string) {
  if (FOLDER_COLORS[folder]) return FOLDER_COLORS[folder];
  let h = 0;
  for (const c of folder) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

const radius = (n: GraphNode) => 6 + Math.min(n.degree, 6) * 2.5;
const nodeOf = (e: string | number | SimNode) => e as SimNode;

export function GraphView({
  vaultId,
  activeId,
  onSelect,
  version,
}: {
  vaultId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  version: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  const [, setTick] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);

  useEffect(() => {
    window.vaultApi
      .graph(vaultId)
      .then(setData)
      .catch(() => setData({ nodes: [], links: [] }));
  }, [vaultId, version]);

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const next = { w: width, h: height };
      sizeRef.current = next;
      setSize(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasSize = size.w > 0 && size.h > 0;

  // Build the simulation once data + size are ready.
  useEffect(() => {
    if (!data || !hasSize) return;
    const { w, h } = sizeRef.current;
    const nodes: SimNode[] = data.nodes.map((n) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * 200,
      y: h / 2 + (Math.random() - 0.5) * 200,
    }));
    const links: SimLink[] = data.links.map((l) => ({ ...l }));

    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.6),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("center", forceCenter(w / 2, h / 2))
      .force(
        "collide",
        forceCollide<SimNode>().radius((d) => radius(d) + 14),
      )
      .force("x", forceX(w / 2).strength(0.04))
      .force("y", forceY(h / 2).strength(0.04))
      .on("tick", () => setTick((t) => t + 1));

    simRef.current = sim;
    nodesRef.current = nodes;
    linksRef.current = links;
    return () => {
      sim.stop();
    };
  }, [data, hasSize]);

  // Keep the centering force in sync with resizes without rebuilding.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || !hasSize) return;
    sim.force("center", forceCenter(size.w / 2, size.h / 2));
    sim.alpha(0.3).restart();
  }, [size.w, size.h, hasSize]);

  // Neighbour lookup for hover highlighting.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data?.links.forEach((l) => {
      const s = typeof l.source === "string" ? l.source : nodeOf(l.source).id;
      const t = typeof l.target === "string" ? l.target : nodeOf(l.target).id;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    });
    return map;
  }, [data]);

  const isLit = (id: string) => !hovered || hovered === id || neighbors.get(hovered)?.has(id);

  // Convert a client point into graph-space (accounting for pan/zoom).
  const toGraph = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.k,
      y: (clientY - rect.top - transform.y) / transform.k,
    };
  };

  // Node dragging.
  const dragRef = useRef<SimNode | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const n = dragRef.current;
      if (!n) return;
      const p = toGraph(e.clientX, e.clientY);
      n.fx = p.x;
      n.fy = p.y;
    };
    const onUp = () => {
      const n = dragRef.current;
      if (n) {
        n.fx = null;
        n.fy = null;
      }
      dragRef.current = null;
      simRef.current?.alphaTarget(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  const startNodeDrag = (e: React.PointerEvent, n: SimNode) => {
    e.stopPropagation();
    dragRef.current = n;
    simRef.current?.alphaTarget(0.3).restart();
    const p = toGraph(e.clientX, e.clientY);
    n.fx = p.x;
    n.fy = p.y;
  };

  // Background pan.
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const onBgPointerDown = (e: React.PointerEvent) => {
    panRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!panRef.current) return;
      setTransform((t) => ({
        ...t,
        x: e.clientX - panRef.current!.x,
        y: e.clientY - panRef.current!.y,
      }));
    };
    const onUp = () => {
      panRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  const onWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTransform((t) => {
      const k = Math.min(4, Math.max(0.2, t.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const gx = (cx - t.x) / t.k;
      const gy = (cy - t.y) / t.k;
      return { k, x: cx - gx * k, y: cy - gy * k };
    });
  };

  const nodes = nodesRef.current;
  const links = linksRef.current;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
      {data && data.nodes.length === 0 && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          No documents to display.
        </div>
      )}

      <svg
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onBgPointerDown}
        onWheel={onWheel}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {links.map((l, i) => {
            const s = nodeOf(l.source);
            const t = nodeOf(l.target);
            if (s.x == null || t.x == null) return null;
            const lit = isLit(s.id) && isLit(t.id);
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                className="stroke-muted-foreground"
                strokeWidth={1.2 / transform.k}
                opacity={lit ? 0.45 : 0.06}
              />
            );
          })}

          {nodes.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = radius(n);
            const lit = isLit(n.id);
            const active = n.id === activeId;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className="cursor-pointer"
                opacity={lit ? 1 : 0.25}
                onPointerDown={(e) => startNodeDrag(e, n)}
                onPointerEnter={() => setHovered(n.id)}
                onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                onClick={() => onSelect(n.id)}
              >
                {active && <circle r={r + 4} fill="none" className="stroke-primary" strokeWidth={2 / transform.k} />}
                <circle r={r} fill={colorFor(n.folder)} stroke="white" strokeWidth={1.5 / transform.k} />
                <text
                  y={r + 11}
                  textAnchor="middle"
                  className="fill-foreground select-none"
                  style={{ fontSize: `${11 / transform.k}px` }}
                  opacity={hovered && !lit ? 0.2 : 0.85}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      {data && data.nodes.length > 0 && (
        <div className="bg-card/80 absolute bottom-3 left-3 rounded-md border p-2 text-xs backdrop-blur">
          {Object.entries(FOLDER_COLORS).map(([folder, color]) => (
            <div key={folder} className="flex items-center gap-2 py-0.5">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{folder}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
