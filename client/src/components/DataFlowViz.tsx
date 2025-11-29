import { createSignal, createEffect, Show, For } from "solid-js";
import ELK from "elkjs/lib/elk.bundled.js";
import FilePicker from "./FilePicker";
import InlineCodePreview from "./InlineCodePreview";

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
  // Optional line metadata from the backend, used for code previews.
  startLine?: number;
  endLine?: number;
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

interface SelectedNodeInfo {
  id: string;
  type?: string;
  label: string;
  startLine?: number;
  endLine?: number;
}

interface FlattenedNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  startLine?: number;
  endLine?: number;
}

interface RenderEdgePath {
  id: string;
  d: string;
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
  const [showFileViewer, setShowFileViewer] = createSignal(true);
  const [selectedNode, setSelectedNode] = createSignal<SelectedNodeInfo | null>(
    null
  );
  const [flatNodes, setFlatNodes] = createSignal<FlattenedNode[]>([]);
  const [edgePaths, setEdgePaths] = createSignal<RenderEdgePath[]>([]);
  const [scale, setScale] = createSignal(1);
  const [translate, setTranslate] = createSignal({ x: 0, y: 0 });

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

    if (isLoading || !data) {
      setFlatNodes([]);
      setEdgePaths([]);
      return;
    }

    // Build a lookup table of absolute node positions (including nested scopes)
    const nodePositions = new Map<
      string,
      { x: number; y: number; width: number; height: number }
    >();
    const newFlatNodes: FlattenedNode[] = [];

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

      const labelText = node.labels?.[0]?.text;
      newFlatNodes.push({
        id: node.id,
        type: node.type,
        x: absX,
        y: absY,
        width,
        height,
        label: labelText,
        startLine: node.startLine,
        endLine: node.endLine,
      });

      if (node.children) {
        for (const child of node.children) {
          collectNodePositions(child, absX, absY);
        }
      }
    };

    collectNodePositions(data, 0, 0);

    // Collect all edges and compute SVG paths using the computed node positions.
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

    const newEdgePaths: RenderEdgePath[] = [];

    for (const edge of allEdges) {
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

      newEdgePaths.push({
        id: edge.id || `${sourceId || "source"}->${targetId || "target"}`,
        d: pathData,
      });
    }

    setFlatNodes(newFlatNodes);
    setEdgePaths(newEdgePaths);
  });

  createEffect(() => {
    const data = graph();
    const isLoading = loading();

    if (isLoading || !data || !svgRef) return;

    const svgWidth = svgRef.clientWidth;
    const svgHeight = svgRef.clientHeight;

    if (!data.width || !data.height || !svgWidth || !svgHeight) return;

    const padding = 40;
    const availableWidth = svgWidth - padding * 2;
    const availableHeight = svgHeight - padding * 2;

    const baseScale = Math.min(
      availableWidth / data.width,
      availableHeight / data.height
    );

    const clampedScale = Math.min(Math.max(baseScale, 0.1), 2);

    const x = (svgWidth - data.width * clampedScale) / 2;
    const y = (svgHeight - data.height * clampedScale) / 2;

    setScale(clampedScale);
    setTranslate({ x, y });
  });

  function isInteractiveNode(node: FlattenedNode) {
    // Any node that has a stable line range should be previewable. In practice
    // this includes variables/usages as well as containing scopes like
    // functions, blocks, JSX scopes, classes, and the global scope.
    const hasRange =
      typeof node.startLine === "number" &&
      typeof node.endLine === "number" &&
      node.startLine > 0 &&
      node.endLine >= node.startLine;

    if (!hasRange) return false;

    return (
      node.type === "variable" ||
      node.type === "usage" ||
      node.type === "function" ||
      node.type === "block" ||
      node.type === "global" ||
      node.type === "class" ||
      node.type === "jsx"
    );
  }

  function handleNodeClick(node: FlattenedNode) {
    // Ignore clicks that are really part of a pan/drag gesture.
    if (hasPanMoved) {
      return;
    }

    if (isInteractiveNode(node)) {
      const labelText = node.label ?? node.id;
      console.log("[DataFlowViz] node clicked", {
        id: node.id,
        type: node.type,
        label: labelText,
        startLine: node.startLine,
        endLine: node.endLine,
      });
      setSelectedNode({
        id: node.id,
        type: node.type,
        label: labelText,
        startLine: node.startLine,
        endLine: node.endLine,
      });
    } else {
      setSelectedNode(null);
    }
  }

  // Simple mouse-based pan/zoom implementation without d3.
  let isPanning = false;
  let lastPanX = 0;
  let lastPanY = 0;
  // Track whether we've moved the mouse enough to count as a drag since the
  // last mouse down. This lets us ignore "clicks" that were actually part of
  // a pan/drag gesture.
  let hasPanMoved = false;
  const PAN_MOVE_THRESHOLD_PX = 4;

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    isPanning = true;
    hasPanMoved = false;
    lastPanX = event.clientX;
    lastPanY = event.clientY;
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isPanning) return;
    const dx = event.clientX - lastPanX;
    const dy = event.clientY - lastPanY;
    // Mark as a drag once we've moved far enough from the initial position.
    if (!hasPanMoved) {
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > PAN_MOVE_THRESHOLD_PX * PAN_MOVE_THRESHOLD_PX) {
        hasPanMoved = true;
      }
    }

    lastPanX = event.clientX;
    lastPanY = event.clientY;
    setTranslate((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  };

  const handleMouseUpOrLeave = () => {
    isPanning = false;
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!svgRef) return;

    const rect = svgRef.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    setScale((prevScale) => {
      // Use a gentler zoom factor so touchpad scrolling feels less jumpy.
      const zoomFactor = event.deltaY < 0 ? 1.05 : 0.95;
      const rawScale = prevScale * zoomFactor;
      const newScale = Math.min(Math.max(rawScale, 0.1), 4);

      // If clamping changed the effective zoom factor, adjust so we still
      // zoom relative to the mouse position.
      const effectiveFactor = prevScale === 0 ? 1 : newScale / prevScale || 1;

      setTranslate((prev) => {
        const x = mouseX - (mouseX - prev.x) * effectiveFactor;
        const y = mouseY - (mouseY - prev.y) * effectiveFactor;
        return { x, y };
      });

      return newScale;
    });
  };

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

            <div class="flex items-center gap-3">
              <label class="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showFileViewer()}
                  onInput={(e) => setShowFileViewer(e.currentTarget.checked)}
                  class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Show file view</span>
              </label>

              <div class="relative">
                <button
                  onClick={() => setShowPicker(!showPicker())}
                  class="px-3 py-1 text-sm border rounded bg-gray-50 hover:bg-gray-100 flex items-center gap-2 text-black"
                >
                  <span class="truncate max-w-[300px]">
                    {currentPath() || "Select File"}
                  </span>
                  <span class="text-xs">▼</span>
                </button>
              </div>
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

        <div class="flex-1 flex overflow-hidden bg-gray-50">
          <div class="relative flex-1 overflow-hidden">
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
                <svg
                  ref={svgRef}
                  class="w-full h-full cursor-grab active:cursor-grabbing"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  onWheel={handleWheel}
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
                      <polygon points="0 0, 10 3.5, 0 7" fill="#555" />
                    </marker>
                  </defs>
                  <g
                    ref={gRef}
                    transform={`translate(${translate().x},${
                      translate().y
                    }) scale(${scale()})`}
                  >
                    {/* Nodes */}
                    <For each={flatNodes()}>
                      {(node) => (
                        <g
                          transform={`translate(${node.x},${node.y})`}
                          class={
                            isInteractiveNode(node)
                              ? "cursor-pointer"
                              : "cursor-default"
                          }
                          onClick={() => handleNodeClick(node)}
                        >
                          <rect
                            width={node.width}
                            height={node.height}
                            rx={4}
                            ry={4}
                            fill={getNodeColor(node.type)}
                            stroke="#333"
                            stroke-width="1"
                          />
                          <Show when={node.label}>
                            <text x={5} y={15} font-size="10px" fill="#000">
                              {node.label}
                            </text>
                          </Show>
                        </g>
                      )}
                    </For>

                    <For each={edgePaths()}>
                      {(edge) => (
                        <path
                          d={edge.d}
                          stroke="#555"
                          stroke-width="1"
                          fill="none"
                          marker-end="url(#arrowhead)"
                        />
                      )}
                    </For>
                  </g>
                </svg>
              </Show>
            </Show>
          </div>

          <Show when={showFileViewer()}>
            <div class="w-[40%] max-w-[600px] border-l border-gray-300">
              <InlineCodePreview
                filePath={currentPath() || null}
                startLine={selectedNode()?.startLine ?? undefined}
                endLine={selectedNode()?.endLine ?? undefined}
              />
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
