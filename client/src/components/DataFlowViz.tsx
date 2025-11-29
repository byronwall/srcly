import { createSignal, createEffect, Show, For } from "solid-js";
import ELK from "elkjs/lib/elk.bundled.js";
import * as d3 from "d3";
import FilePicker from "./FilePicker";

interface DataFlowVizProps {
  path: string;
  onClose: () => void;
}

interface ElkNode {
  id: string;
  labels?: { text: string }[];
  children?: ElkNode[];
  edges?: ElkEdge[];
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  type?: string; // 'variable', 'usage', 'function', 'block', 'global'
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
}

interface GraphData extends ElkNode {
  edges?: ElkEdge[];
}

export default function DataFlowViz(props: DataFlowVizProps) {
  const [currentPath, setCurrentPath] = createSignal(props.path);
  const [graph, setGraph] = createSignal<GraphData | null>(null);
  const [rawGraph, setRawGraph] = createSignal<GraphData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [showPicker, setShowPicker] = createSignal(false);
  const [depth, setDepth] = createSignal(2);
  const [maxDepth, setMaxDepth] = createSignal(2);

  let svgRef: SVGSVGElement | undefined;
  let gRef: SVGGElement | undefined;

  const elk = new ELK();

  createEffect(() => {
    if (currentPath()) {
      fetchDataFlow(currentPath());
    }
  });

  createEffect(() => {
    const raw = rawGraph();
    const d = depth();
    if (raw) {
      processGraph(raw, d);
    }
  });

  async function fetchDataFlow(path: string) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("http://localhost:8000/api/analysis/data-flow");
      url.searchParams.append("path", path);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch data flow analysis");

      const data = await response.json();
      setRawGraph(data);

      // Calculate max depth
      const calculateMaxDepth = (
        node: ElkNode,
        currentDepth: number
      ): number => {
        if (!node.children || node.children.length === 0) return currentDepth;
        return Math.max(
          ...node.children.map((c) => calculateMaxDepth(c, currentDepth + 1))
        );
      };
      setMaxDepth(calculateMaxDepth(data, 0));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function processGraph(data: GraphData, maxDepthLevel: number) {
    setLoading(true);
    try {
      // Filter graph based on depth
      const filterNode = (
        node: ElkNode,
        currentDepth: number
      ): ElkNode | null => {
        if (currentDepth > maxDepthLevel) return null;

        const newNode = { ...node };
        if (node.children) {
          newNode.children = node.children
            .map((c) => filterNode(c, currentDepth + 1))
            .filter((c): c is ElkNode => c !== null);
        }

        return newNode;
      };

      const filteredRoot = filterNode(data, 0);
      if (!filteredRoot) {
        setGraph(null);
        setLoading(false);
        return;
      }

      // Collect all valid IDs
      const validIds = new Set<string>();
      const collectIds = (node: ElkNode) => {
        validIds.add(node.id);
        node.children?.forEach(collectIds);
      };
      collectIds(filteredRoot);

      // Filter edges at the root (since rawGraph has them at root)
      // Note: ELK might move edges to children during layout, but initially they are at root.
      if (filteredRoot.edges) {
        filteredRoot.edges = filteredRoot.edges.filter(
          (e) =>
            e.sources.every((s) => validIds.has(s)) &&
            e.targets.every((t) => validIds.has(t))
        );
      }

      // Layout with ELK. We cast to `any` because our local `ElkNode` / `ElkEdge`
      // interfaces are a simplified view of ELK's richer types, but at runtime
      // the shape is compatible.
      const layoutedGraph = (await elk.layout(
        filteredRoot as any
      )) as GraphData;
      setGraph(layoutedGraph);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    const data = graph();
    const isLoading = loading();

    if (isLoading || !data || !svgRef || !gRef) return;

    console.log("Rendering graph", data);

    const svg = d3.select(svgRef);
    const g = d3.select(gRef);

    // Clear previous
    g.selectAll("*").remove();

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Build a lookup table of absolute node positions (including nested scopes)
    const nodePositions = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();

    const collectNodePositions = (
      node: ElkNode,
      offsetX: number,
      offsetY: number
    ) => {
      const absX = (node.x || 0) + offsetX;
      const absY = (node.y || 0) + offsetY;
      const width = node.width || 0;
      const height = node.height || 0;

      nodePositions.set(node.id, { x: absX, y: absY, width, height });

      if (node.children) {
        for (const child of node.children) {
          collectNodePositions(child, absX, absY);
        }
      }
    };

    collectNodePositions(data, 0, 0);

    // Render nodes recursively
    renderNode(g, data);

    // Collect all edges and render them using the computed node positions.
    // We ignore ELK's edge sections and instead draw simple orthogonal
    // connector paths from the source node to the target node so that
    // arrows clearly start/end at the correct boxes, even across nested scopes.
    const allEdges: ElkEdge[] = [];
    const collectEdges = (node: ElkNode) => {
      if (node.edges) {
        allEdges.push(...node.edges);
      }
      if (node.children) {
        for (const child of node.children) {
          collectEdges(child);
        }
      }
    };
    collectEdges(data);

    if (allEdges.length > 0) {
      renderEdges(g, allEdges, nodePositions);
    }

    // Initial zoom to fit
    const root = data;
    const svgWidth = svgRef.clientWidth;
    const svgHeight = svgRef.clientHeight;

    if (root.width && root.height && svgWidth && svgHeight) {
      const padding = 40;
      const availableWidth = svgWidth - padding * 2;
      const availableHeight = svgHeight - padding * 2;

      const scale = Math.min(
        availableWidth / root.width,
        availableHeight / root.height
      );

      // Clamp scale to reasonable limits
      const clampedScale = Math.min(Math.max(scale, 0.1), 2);

      const x = (svgWidth - root.width * clampedScale) / 2;
      const y = (svgHeight - root.height * clampedScale) / 2;

      const transform = d3.zoomIdentity.translate(x, y).scale(clampedScale);

      svg.call(zoom.transform, transform);
    }
  });

  function renderNode(
    parentG: d3.Selection<any, any, any, any>,
    node: ElkNode
  ) {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 0;
    const h = node.height || 0;

    const nodeGroup = parentG
      .append("g")
      .attr("transform", `translate(${x},${y})`);

    // Draw box
    nodeGroup
      .append("rect")
      .attr("width", w)
      .attr("height", h)
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", getNodeColor(node.type))
      .attr("stroke", "#333")
      .attr("stroke-width", 1);

    // Label
    if (node.labels && node.labels.length > 0) {
      nodeGroup
        .append("text")
        .attr("x", 5)
        .attr("y", 15)
        .text(node.labels[0].text)
        .attr("font-size", "10px")
        .attr("fill", "#000");
    }

    // Children
    if (node.children) {
      for (const child of node.children) {
        renderNode(nodeGroup, child);
      }
    }
  }

  function renderEdges(
    parentG: d3.Selection<any, any, any, any>,
    edges: ElkEdge[],
    nodePositions: Map<
      string,
      { x: number; y: number; width: number; height: number }
    >
  ) {
    const edgeGroup = parentG.append("g").attr("class", "edges");

    for (const edge of edges) {
      const sourceId = edge.sources[0];
      const targetId = edge.targets[0];

      const sourcePos = nodePositions.get(sourceId);
      const targetPos = nodePositions.get(targetId);

      if (!sourcePos || !targetPos) continue;

      // Start at bottom-center of source box, end at top-center of target box.
      const startX = sourcePos.x + sourcePos.width / 2;
      const startY = sourcePos.y + sourcePos.height;
      const endX = targetPos.x + targetPos.width / 2;
      const endY = targetPos.y;

      // Simple orthogonal (elbow) connector: down from source, across, then up/down to target.
      const midY = (startY + endY) / 2;
      const pathData = `M${startX},${startY} L${startX},${midY} L${endX},${midY} L${endX},${endY}`;

      edgeGroup
        .append("path")
        .attr("d", pathData)
        .attr("stroke", "#555")
        .attr("stroke-width", 1)
        .attr("fill", "none")
        .attr("marker-end", "url(#arrowhead)");
    }
  }

  function getNodeColor(type?: string) {
    switch (type) {
      case "variable":
        return "#a8d5e2"; // Light Blue
      case "usage":
        return "#f5a9b8"; // Light Red/Pink
      case "function":
        return "#e2e2e2"; // Light Gray
      case "block":
        return "#f0f0f0"; // Very Light Gray
      case "global":
        return "#ffffff";
      default:
        return "#ffffff";
    }
  }

  // log out analysis deets and grpah layut
  createEffect(() => {
    console.log("Analysis Data:", graph());
  });

  return (
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col overflow-hidden">
        <div class="flex justify-between items-center p-4 border-b border-gray-200">
          <div class="flex items-center gap-4">
            <h2 class="text-lg font-semibold text-gray-800">Data Flow</h2>

            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">Depth:</span>
              <div class="flex border rounded overflow-hidden">
                <For each={Array.from({ length: maxDepth() + 1 }, (_, i) => i)}>
                  {(i) => (
                    <button
                      onClick={() => setDepth(i)}
                      class={`px-3 py-1 text-sm ${
                        depth() === i
                          ? "bg-blue-500 text-white"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                      } border-r last:border-r-0`}
                    >
                      {i}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="relative">
              <button
                onClick={() => setShowPicker(!showPicker())}
                class="px-3 py-1 text-sm border rounded bg-gray-50 hover:bg-gray-100 flex items-center gap-2"
              >
                <span class="truncate max-w-[300px]">
                  {currentPath() || "Select File"}
                </span>
                <span class="text-xs">▼</span>
              </button>

              <Show when={showPicker()}>
                <div class="absolute top-full left-0 mt-1 w-[400px] z-50 bg-white shadow-xl border rounded-lg max-h-[400px] overflow-hidden">
                  <FilePicker
                    initialPath={props.path}
                    onSelect={(path) => {
                      setCurrentPath(path);
                      setShowPicker(false);
                    }}
                  />{" "}
                </div>
              </Show>
            </div>
          </div>

          <button
            onClick={props.onClose}
            class="text-gray-500 hover:text-gray-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="flex-1 relative overflow-hidden bg-gray-50">
          <Show
            when={!loading()}
            fallback={
              <div class="absolute inset-0 flex items-center justify-center text-gray-500">
                Loading analysis...
              </div>
            }
          >
            <Show
              when={!error()}
              fallback={
                <div class="absolute inset-0 flex items-center justify-center text-red-500">
                  {error()}
                </div>
              }
            >
              <svg ref={svgRef} class="w-full h-full">
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#555" />
                  </marker>
                </defs>
                <g ref={gRef} />
              </svg>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
