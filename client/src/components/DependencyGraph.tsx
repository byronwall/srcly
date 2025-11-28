import { createSignal, createEffect, Show, For } from "solid-js";
import CodeModal from "./CodeModal";
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

interface GraphData {
  nodes: any[];
  edges: any[];
}

export default function DependencyGraph(props: DependencyGraphProps) {
  const [nodes, setNodes] = createSignal<Node[]>([]);
  const [edges, setEdges] = createSignal<Edge[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [rawGraph, setRawGraph] = createSignal<GraphData | null>(null);
  const [showExternal, setShowExternal] = createSignal(false);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
  const [activeNodeId, setActiveNodeId] = createSignal<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(
    null
  );

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

      const data = (await response.json()) as GraphData;
      setRawGraph(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function filterGraphByExternal(
    data: GraphData,
    includeExternal: boolean
  ): GraphData {
    if (includeExternal) return data;

    const filteredNodes = data.nodes.filter((n) => n.type !== "external");
    const allowedIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => allowedIds.has(e.source) && allowedIds.has(e.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }

  async function layoutGraph(data: GraphData) {
    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "50",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50",
      },
      children: data.nodes.map((n) => ({
        width: Math.max(100, (n.label as string).length * 8),
        height: 40,
        labels: [{ text: n.label as string }],
        ...n,
      })),
      edges: data.edges.map((e) => ({
        sources: [e.source as string],
        targets: [e.target as string],
        ...e,
      })),
    };

    try {
      const layout = await elk.layout(elkGraph as any);
      setNodes(layout.children as Node[]);
      setEdges(layout.edges as unknown as Edge[]);

      // Fit graph after layout update
      setTimeout(fitGraph, 0);
    } catch (err) {
      console.error("Layout error:", err);
      setError("Failed to layout graph");
    }
  }

  createEffect(() => {
    const data = rawGraph();
    if (!data) return;
    const includeExternal = showExternal();
    void layoutGraph(filterGraphByExternal(data, includeExternal));
  });

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

  function handleNodeClick(node: Node) {
    if (node.type !== "file") return;
    setActiveNodeId(node.id);
    // Slight delay so the active styling is visible before the modal appears
    setTimeout(() => {
      setSelectedFilePath(node.id);
    }, 50);
  }

  return (
    <div class="absolute inset-0 bg-[#1e1e1e] z-50 flex flex-col">
      <div class="flex items-center justify-between px-4 py-2 border-b border-[#333] bg-[#252526]">
        <h2 class="text-sm font-bold text-gray-300">
          Dependency Graph: {props.path || "Root"}
        </h2>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={showExternal()}
              onChange={(e) => setShowExternal(e.currentTarget.checked)}
            />
            <span>Show external deps</span>
          </label>
          <div class="h-4 w-px bg-[#444]" />
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
                {(node) => {
                  const isActive = activeNodeId() === node.id;
                  const isHovered = hoveredNodeId() === node.id;
                  const isExternal = node.type === "external";
                  const isEmphasized = isActive || isHovered;

                  const fill = isExternal
                    ? isEmphasized
                      ? "#383838"
                      : "#2d2d2d"
                    : isEmphasized
                    ? "#273955"
                    : "#1e1e1e";

                  const stroke = isExternal
                    ? isEmphasized
                      ? "#888"
                      : "#444"
                    : isEmphasized
                    ? "#9cdcfe"
                    : "#569cd6";

                  const textFill = isExternal
                    ? isEmphasized
                      ? "#bbbbbb"
                      : "#888"
                    : isEmphasized
                    ? "#f3f3f3"
                    : "#d4d4d4";

                  return (
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      class="cursor-pointer"
                      onClick={() => handleNodeClick(node)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => {
                        if (hoveredNodeId() === node.id) {
                          setHoveredNodeId(null);
                        }
                      }}
                    >
                      <rect
                        width={node.width}
                        height={node.height}
                        rx="4"
                        fill={fill}
                        stroke={stroke}
                        stroke-width={isEmphasized ? "2" : "1"}
                      />
                      <text
                        x={(node.width || 0) / 2}
                        y={(node.height || 0) / 2}
                        dy="0.35em"
                        text-anchor="middle"
                        fill={textFill}
                        font-size="12px"
                        class="pointer-events-none select-none"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                }}
              </For>
            </g>
          </svg>
        </Show>
      </div>
      <CodeModal
        isOpen={!!selectedFilePath()}
        filePath={selectedFilePath()}
        onClose={() => {
          setSelectedFilePath(null);
          setActiveNodeId(null);
        }}
      />
    </div>
  );
}
