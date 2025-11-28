import { createSignal, createEffect, Show, For } from "solid-js";
import ELK from "elkjs/lib/elk.bundled.js";
import { select, zoom, zoomIdentity } from "d3";

interface DependencyGraphProps {
  path: string;
  onClose: () => void;
}

interface Node {
  id: string;
  label: string;
  type: "file" | "external";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
}

export default function DependencyGraph(props: DependencyGraphProps) {
  const [nodes, setNodes] = createSignal<Node[]>([]);
  const [edges, setEdges] = createSignal<Edge[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let svgRef: SVGSVGElement | undefined;
  let gRef: SVGGElement | undefined;
  let zoomBehavior: any;

  const elk = new ELK();

  createEffect(() => {
    fetchGraph(props.path);
  });

  async function fetchGraph(path: string) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("http://localhost:8000/api/analysis/dependencies");
      if (path) url.searchParams.append("path", path);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch dependencies");

      const data = await response.json();
      await layoutGraph(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function layoutGraph(data: { nodes: any[]; edges: any[] }) {
    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "50",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50",
      },
      children: data.nodes.map((n) => ({
        id: n.id,
        width: Math.max(100, n.label.length * 8),
        height: 40,
        labels: [{ text: n.label }],
        ...n,
      })),
      edges: data.edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
        ...e,
      })),
    };

    try {
      const layout = await elk.layout(elkGraph);
      setNodes(layout.children as Node[]);
      setEdges(layout.edges as Edge[]);

      // Fit graph after layout update
      setTimeout(fitGraph, 0);
    } catch (err) {
      console.error("Layout error:", err);
      setError("Failed to layout graph");
    }
  }

  function setupZoom() {
    if (!svgRef || !gRef) return;

    zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        select(gRef).attr("transform", event.transform);
      });

    select(svgRef).call(zoomBehavior);
  }

  function fitGraph() {
    if (!svgRef || !gRef || nodes().length === 0 || !zoomBehavior) return;

    const svg = select(svgRef);
    const g = select(gRef);

    // Get graph bounds
    const bounds = g.node()?.getBBox();
    if (!bounds) return;

    const parent = svg.node()?.parentElement;
    const width = parent?.clientWidth || 1000;
    const height = parent?.clientHeight || 800;
    const padding = 40;

    const scale = Math.min(
      (width - padding * 2) / bounds.width,
      (height - padding * 2) / bounds.height
    );

    // Limit initial scale
    const finalScale = Math.min(scale, 1);

    const x = (width - bounds.width * finalScale) / 2 - bounds.x * finalScale;
    const y = (height - bounds.height * finalScale) / 2 - bounds.y * finalScale;

    const transform = zoomIdentity.translate(x, y).scale(finalScale);

    svg.transition().duration(750).call(zoomBehavior.transform, transform);
  }

  // Initialize zoom when SVG becomes available
  createEffect(() => {
    if (!loading() && !error() && svgRef) {
      setupZoom();
    }
  });

  return (
    <div class="absolute inset-0 bg-[#1e1e1e] z-50 flex flex-col">
      <div class="flex items-center justify-between px-4 py-2 border-b border-[#333] bg-[#252526]">
        <h2 class="text-sm font-bold text-gray-300">
          Dependency Graph: {props.path || "Root"}
        </h2>
        <div class="flex gap-2">
          <button
            onClick={fitGraph}
            class="px-3 py-1 text-xs bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-200 rounded border border-[#555] transition-colors"
          >
            Fit View
          </button>
          <button
            onClick={props.onClose}
            class="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-200 rounded border border-red-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div class="flex-1 relative overflow-hidden">
        <Show when={loading()}>
          <div class="absolute inset-0 flex items-center justify-center text-gray-400">
            Loading dependency graph...
          </div>
        </Show>

        <Show when={error()}>
          <div class="absolute inset-0 flex items-center justify-center text-red-400">
            Error: {error()}
          </div>
        </Show>

        <Show when={!loading() && !error()}>
          <svg
            ref={svgRef}
            class="w-full h-full cursor-grab active:cursor-grabbing"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
              </marker>
            </defs>

            <g ref={gRef}>
              <For each={edges()}>
                {(edge) => {
                  if (!edge.sections || edge.sections.length === 0) return null;
                  const section = edge.sections[0];
                  let d = `M ${section.startPoint.x} ${section.startPoint.y}`;
                  if (section.bendPoints) {
                    section.bendPoints.forEach((p) => {
                      d += ` L ${p.x} ${p.y}`;
                    });
                  }
                  d += ` L ${section.endPoint.x} ${section.endPoint.y}`;

                  return (
                    <path
                      d={d}
                      stroke="#666"
                      stroke-width="1"
                      fill="none"
                      marker-end="url(#arrowhead)"
                    />
                  );
                }}
              </For>

              <For each={nodes()}>
                {(node) => (
                  <g transform={`translate(${node.x}, ${node.y})`}>
                    <rect
                      width={node.width}
                      height={node.height}
                      rx="4"
                      fill={node.type === "external" ? "#2d2d2d" : "#1e1e1e"}
                      stroke={node.type === "external" ? "#444" : "#569cd6"}
                      stroke-width="1"
                    />
                    <text
                      x={(node.width || 0) / 2}
                      y={(node.height || 0) / 2}
                      dy="0.35em"
                      text-anchor="middle"
                      fill={node.type === "external" ? "#888" : "#d4d4d4"}
                      font-size="12px"
                      class="pointer-events-none select-none"
                    >
                      {node.label}
                    </text>
                  </g>
                )}
              </For>
            </g>
          </svg>
        </Show>
      </div>
    </div>
  );
}
