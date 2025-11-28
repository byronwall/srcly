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
  type: "file" | "external" | "dummy";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // High in-degree (“super”) node visualization
  assignmentCode?: string;
  assignmentColor?: string;
  isSuperNode?: boolean;
  // For dummy nodes, which super node they stand in for
  superNodeId?: string;
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

interface SuperNodeAssignment {
  nodeId: string;
  label: string;
  code: string;
  color: string;
}

const MAX_INCOMING_LINKS = 5;

const ASSIGNMENT_COLORS = [
  "#ff6b6b",
  "#feca57",
  "#54a0ff",
  "#5f27cd",
  "#1dd1a1",
  "#ff9ff3",
  "#48dbfb",
  "#ffaf40",
  "#00d2d3",
  "#c8d6e5",
];

function generateAssignmentCode(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const first = Math.floor(index / letters.length);
  const second = index % letters.length;
  const safeFirst = Math.min(first, letters.length - 1);
  const safeSecond = Math.min(second, letters.length - 1);
  return `${letters[safeFirst]}${letters[safeSecond]}`;
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
  const [superNodeAssignments, setSuperNodeAssignments] = createSignal<
    SuperNodeAssignment[]
  >([]);

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

  function transformHighInDegreeNodes(data: GraphData): {
    graph: GraphData;
    assignments: SuperNodeAssignment[];
  } {
    if (!data.nodes || !data.edges) {
      return { graph: data, assignments: [] };
    }

    const inDegree = new Map<string, number>();
    for (const edge of data.edges) {
      if (!edge || typeof edge.target !== "string") continue;
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const candidateIds = Array.from(inDegree.entries())
      .filter(([, count]) => count > MAX_INCOMING_LINKS)
      .map(([id]) => id);

    if (candidateIds.length === 0) {
      return { graph: data, assignments: [] };
    }

    const nodeById = new Map<string, any>(
      data.nodes.map((n: any) => [n.id as string, n])
    );

    // Stable ordering by label so assignments/codes are deterministic
    const sortedSuperIds = [...candidateIds].sort((a, b) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      const la = (na?.label ?? "").toString().toLowerCase();
      const lb = (nb?.label ?? "").toString().toLowerCase();
      return la.localeCompare(lb);
    });

    const assignments: SuperNodeAssignment[] = [];
    const assignmentById = new Map<string, SuperNodeAssignment>();

    sortedSuperIds.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) return;
      const code = generateAssignmentCode(index);
      const color =
        ASSIGNMENT_COLORS[index % ASSIGNMENT_COLORS.length] ??
        ASSIGNMENT_COLORS[ASSIGNMENT_COLORS.length - 1];
      const assignment: SuperNodeAssignment = {
        nodeId: id,
        label: (node.label ?? id) as string,
        code,
        color,
      };
      assignments.push(assignment);
      assignmentById.set(id, assignment);
    });

    if (assignments.length === 0) {
      return { graph: data, assignments: [] };
    }

    const baseNodes = data.nodes.map((n: any) => {
      const assignment = assignmentById.get(n.id as string);
      if (!assignment) return n;
      return {
        ...n,
        assignmentCode: assignment.code,
        assignmentColor: assignment.color,
        isSuperNode: true,
      };
    });

    const newNodes: any[] = [...baseNodes];
    const newEdges: any[] = [];

    let dummyIndex = 0;
    for (const edge of data.edges) {
      const targetAssignment = assignmentById.get(edge.target as string);
      if (!targetAssignment) {
        newEdges.push(edge);
        continue;
      }

      const baseEdgeId =
        (edge.id as string | undefined) ??
        `${String(edge.source)}->${String(edge.target)}`;
      const dummyId = `__dummy__${baseEdgeId}__${dummyIndex++}`;

      newNodes.push({
        id: dummyId,
        label: targetAssignment.code,
        type: "dummy",
        assignmentCode: targetAssignment.code,
        assignmentColor: targetAssignment.color,
        superNodeId: targetAssignment.nodeId,
      });

      newEdges.push({
        ...edge,
        id: `${baseEdgeId}__to_dummy`,
        target: dummyId,
      });
    }

    return {
      graph: {
        nodes: newNodes,
        edges: newEdges,
      },
      assignments,
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
      children: data.nodes.map((n: any) => {
        const isDummy = n.type === "dummy";
        const width = isDummy
          ? 26
          : Math.max(100, String(n.label ?? "").length * 8);
        const height = isDummy ? 26 : 40;
        return {
          width,
          height,
          labels: isDummy ? [] : [{ text: String(n.label ?? "") }],
          ...n,
        };
      }),
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
    const filtered = filterGraphByExternal(data, includeExternal);
    const { graph, assignments } = transformHighInDegreeNodes(filtered);
    setSuperNodeAssignments(assignments);
    void layoutGraph(graph);
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
    if (node.type === "dummy") {
      if (node.superNodeId) {
        setActiveNodeId(node.superNodeId);
        setTimeout(() => {
          setSelectedFilePath(node.superNodeId as string);
        }, 50);
      }
      return;
    }

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
                  const isDummy = node.type === "dummy";
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

                  const baseStroke = isExternal
                    ? isEmphasized
                      ? "#888"
                      : "#444"
                    : isEmphasized
                    ? "#9cdcfe"
                    : "#569cd6";

                  const stroke =
                    node.isSuperNode && node.assignmentColor
                      ? node.assignmentColor
                      : baseStroke;

                  const textFill = isExternal
                    ? isEmphasized
                      ? "#bbbbbb"
                      : "#888"
                    : isEmphasized
                    ? "#f3f3f3"
                    : "#d4d4d4";

                  if (isDummy) {
                    const radius =
                      Math.min(node.width ?? 20, node.height ?? 20) / 2 - 2;
                    const cx = (node.width ?? 20) / 2;
                    const cy = (node.height ?? 20) / 2;

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
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius}
                          fill={node.assignmentColor || "#888"}
                          stroke="#111"
                          stroke-width="1.5"
                        />
                        <text
                          x={cx}
                          y={cy}
                          dy="0.35em"
                          text-anchor="middle"
                          fill="#000"
                          font-size="10px"
                          class="pointer-events-none select-none font-mono"
                        >
                          {node.assignmentCode}
                        </text>
                      </g>
                    );
                  }

                  const displayLabel = node.assignmentCode
                    ? `[${node.assignmentCode}] ${node.label}`
                    : node.label;

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
                        {displayLabel}
                      </text>
                    </g>
                  );
                }}
              </For>
            </g>
          </svg>
        </Show>
      </div>
      <Show when={superNodeAssignments().length > 0}>
        <div class="absolute bottom-4 left-4 bg-[#1e1e1e]/95 border border-[#333] rounded px-3 py-2 text-xs text-gray-200 shadow-lg max-w-sm">
          <div class="font-bold text-gray-300 text-[11px] mb-1 border-b border-[#333] pb-1">
            High In-Degree Targets
          </div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <For each={superNodeAssignments()}>
              {(item) => (
                <div class="flex items-center gap-2">
                  <div
                    class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono"
                    style={{
                      "background-color": item.color,
                      color: "#000",
                    }}
                  >
                    {item.code}
                  </div>
                  <span class="truncate max-w-[220px]" title={item.label}>
                    {item.label}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
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
