import { createSignal, createEffect, Show, For } from "solid-js";
import { useFileContent } from "../hooks/useFileContent";
import { useHighlightedCode } from "../hooks/useHighlightedCode";
import { FlowOverlayCode } from "./FlowOverlayCode";

interface DataFlowVizProps {
  path: string;
  onClose: () => void;
  onFileSelect?: (path: string, startLine?: number, endLine?: number) => void;
}

// --- Data Types ---

interface NodeData {
  id: string;
  labels?: { text: string }[];
  children?: NodeData[];
  edges?: EdgeData[];
  type?: string;
  startLine?: number;
  endLine?: number;
  path?: string; // File path if different from root
  params?: string[];
}

interface EdgeData {
  id: string;
  sources: string[];
  targets: string[];
  type?: string;
}

interface LayoutNode extends NodeData {
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
  absX: number;
  absY: number;
  // Grouping info
  isGroup?: boolean; // If true, this is a synthetic group (e.g. if/else)
  groupType?: string; // 'if-chain', 'try-chain'
}

interface RenderEdge {
  id: string;
  d: string;
  type?: string;
}

// --- Constants & Config ---

const CONSTANTS = {
  FONT_SIZE: 12,
  CHAR_WIDTH: 7.5,
  LINE_HEIGHT: 20,
  PADDING_X: 12,
  PADDING_Y: 8,
  HEADER_HEIGHT: 28,
  CHILD_GAP: 8,
  COLUMN_GAP: 12,
  MIN_WIDTH: 100,
  MAX_COLS: 3,
};

// --- Layout Engine ---

function measureText(text: string): number {
  return Math.max(text.length * CONSTANTS.CHAR_WIDTH, 40);
}

// Helper to group control flow nodes (if/else, try/catch)
function groupControlFlowNodes(nodes: NodeData[]): NodeData[] {
  const grouped: NodeData[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];

    // Check for If/Else chain
    if (node.type === "if") {
      const chain = [node];
      let j = i + 1;
      while (j < nodes.length) {
        const next = nodes[j];
        if (next.type === "else_branch" || next.type === "else") {
          chain.push(next);
          j++;
        } else {
          break;
        }
      }
      if (chain.length > 1) {
        grouped.push({
          id: `group-${node.id}`,
          type: "group",
          labels: [{ text: "If/Else Group" }], // Internal label
          children: chain,
          // Propagate edges? For now assume edges are on children
        } as any); // Type cast for synthetic node
        i = j;
        continue;
      }
    }

    // Check for Try/Catch/Finally chain
    if (node.type === "try") {
      const chain = [node];
      let j = i + 1;
      while (j < nodes.length) {
        const next = nodes[j];
        if (next.type === "catch" || next.type === "finally") {
          chain.push(next);
          j++;
        } else {
          break;
        }
      }
      if (chain.length > 1) {
        grouped.push({
          id: `group-${node.id}`,
          type: "group",
          labels: [{ text: "Try/Catch Group" }],
          children: chain,
        } as any);
        i = j;
        continue;
      }
    }

    grouped.push(node);
    i++;
  }
  return grouped;
}

function calculateLayout(node: NodeData, absX = 0, absY = 0): LayoutNode {
  const label = node.labels?.[0]?.text || node.id;
  const isLeaf = !node.children || node.children.length === 0;

  // Synthetic group handling
  const isSyntheticGroup = (node as any).type === "group";

  let contentWidth = 0;
  let contentHeight = 0;
  const childrenLayout: LayoutNode[] = [];

  if (!isLeaf && node.children) {
    // 1. Preprocess children (grouping) - ONLY if not already a group
    // If we are already a group, our children are the chain items, don't re-group them.
    const rawChildren = isSyntheticGroup
      ? node.children
      : groupControlFlowNodes(node.children);

    // Sort children by startLine if not a synthetic group (groups preserve order)
    const sortedChildren = isSyntheticGroup
      ? rawChildren
      : [...rawChildren].sort(
          (a, b) => (a.startLine || 0) - (b.startLine || 0)
        );

    // 2. Layout Children recursively
    const layouts = sortedChildren.map((child) => calculateLayout(child, 0, 0));

    // 3. Position Children
    if (isSyntheticGroup) {
      // Vertical Stack with 0 gap (overlap borders by 1px)
      let currentY = 0;
      let maxWidth = 0;
      for (const child of layouts) {
        child.x = 0;
        child.y = currentY;
        currentY += child.height - 1; // Overlap borders
        maxWidth = Math.max(maxWidth, child.width);
      }
      // Stretch children to max width
      for (const child of layouts) {
        child.width = maxWidth;
      }
      contentWidth = maxWidth;
      contentHeight = currentY + 1; // Add back the last pixel
    } else {
      // Masonry Layout
      const maxChildWidth = layouts.reduce(
        (max, l) => Math.max(max, l.width),
        0
      );
      const isWide = maxChildWidth > 500;
      const count = layouts.length;

      let numCols = 1;
      if (!isWide && count > 1) {
        numCols = count > 4 ? 3 : 2;
      }

      const cols: LayoutNode[][] = Array.from({ length: numCols }, () => []);
      const colHeights = new Array(numCols).fill(0);

      // Distribute children to shortest column
      for (const child of layouts) {
        let minH = colHeights[0];
        let colIdx = 0;
        for (let i = 1; i < numCols; i++) {
          if (colHeights[i] < minH) {
            minH = colHeights[i];
            colIdx = i;
          }
        }
        cols[colIdx].push(child);
        colHeights[colIdx] += child.height + CONSTANTS.CHILD_GAP;
      }

      // Position children
      const colWidths = cols.map((col) =>
        col.reduce((max, node) => Math.max(max, node.width), 0)
      );

      let currentX = CONSTANTS.PADDING_X;
      let maxH = 0;

      for (let i = 0; i < numCols; i++) {
        let currentY = CONSTANTS.HEADER_HEIGHT + CONSTANTS.PADDING_Y;
        for (const node of cols[i]) {
          node.x = currentX;
          node.y = currentY;
          currentY += node.height + CONSTANTS.CHILD_GAP;
        }
        if (cols[i].length > 0) currentY -= CONSTANTS.CHILD_GAP;
        maxH = Math.max(maxH, currentY);

        currentX += colWidths[i] + CONSTANTS.COLUMN_GAP;
      }

      contentWidth = Math.max(
        0,
        currentX - CONSTANTS.COLUMN_GAP + CONSTANTS.PADDING_X
      );
      contentHeight = maxH + CONSTANTS.PADDING_Y;

      childrenLayout.push(...layouts);
    }

    if (isSyntheticGroup) {
      childrenLayout.push(...layouts);
    }
  } else {
    // Leaf
    contentWidth = measureText(label);
    contentHeight = CONSTANTS.LINE_HEIGHT;
  }

  // Final Dimensions
  let width = 0;
  let height = 0;

  if (isSyntheticGroup) {
    width = contentWidth;
    height = contentHeight;
  } else {
    width = Math.max(
      contentWidth + CONSTANTS.PADDING_X * 2,
      measureText(label) + CONSTANTS.PADDING_X * 2 + 40,
      CONSTANTS.MIN_WIDTH
    );
    height = Math.max(contentHeight, CONSTANTS.HEADER_HEIGHT);
  }

  return {
    ...node,
    children: childrenLayout,
    x: 0,
    y: 0,
    width,
    height,
    absX,
    absY,
    isGroup: isSyntheticGroup,
  };
}

function updateAbsolutePositions(
  node: LayoutNode,
  parentAbsX: number,
  parentAbsY: number
) {
  node.absX = parentAbsX + node.x;
  node.absY = parentAbsY + node.y;
  for (const child of node.children) {
    updateAbsolutePositions(child, node.absX, node.absY);
  }
}

function flattenGraph(root: LayoutNode): Map<string, LayoutNode> {
  const map = new Map<string, LayoutNode>();
  const traverse = (n: LayoutNode) => {
    if (!n.isGroup) map.set(n.id, n);
    n.children.forEach(traverse);
  };
  traverse(root);
  return map;
}

// --- Sidebar Code Preview ---

const CodeSidebar = (props: {
  path: string;
  startLine?: number;
  endLine?: number;
  onClose: () => void;
}) => {
  const { rawCode, loading, error } = useFileContent({
    isOpen: () => true,
    filePath: () => props.path,
  });

  const { highlightedHtml } = useHighlightedCode({
    rawCode,
    filePath: () => props.path,
    lineFilterEnabled: () => false,
    lineOffset: () => 0,
    targetStart: () => null,
    targetEnd: () => null,
    reduceIndentation: () => false,
  });

  return (
    <div class="w-1/3 h-full border-l border-gray-700 bg-[#1e1e1e] flex flex-col">
      <div class="flex justify-between items-center p-2 border-b border-gray-700 bg-[#252526]">
        <span class="text-xs font-mono truncate px-2">
          {props.path.split("/").pop()}
        </span>
        <button
          onClick={props.onClose}
          class="text-gray-400 hover:text-white px-2"
        >
          ×
        </button>
      </div>
      <div class="flex-1 overflow-auto p-4 text-xs">
        <Show
          when={!loading() && !error()}
          fallback={<div class="text-gray-500">Loading...</div>}
        >
          <Show
            when={highlightedHtml()}
            fallback={<div class="text-gray-500">Rendering…</div>}
          >
            <FlowOverlayCode html={() => highlightedHtml() || ""} />
          </Show>
        </Show>
        <Show when={!loading() && error()}>
          <div class="rounded border border-red-700 bg-red-900/70 px-3 py-2 text-red-100">
            {error()}
          </div>
        </Show>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function DataFlowViz(props: DataFlowVizProps) {
  const [rootNode, setRootNode] = createSignal<LayoutNode | null>(null);
  const [nodeMap, setNodeMap] = createSignal<Map<string, LayoutNode>>(
    new Map()
  );
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Viewport
  const [scale, setScale] = createSignal(1);
  const [translate, setTranslate] = createSignal({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [hasDragged, setHasDragged] = createSignal(false);

  // Selection
  const [selectedNode, setSelectedNode] = createSignal<{
    path: string;
    startLine?: number;
    endLine?: number;
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);

  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.path) fetchData(props.path);
  });

  async function fetchData(path: string) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("http://localhost:8000/api/analysis/data-flow");
      url.searchParams.append("path", path);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch data flow");
      const data: NodeData = await res.json();

      const layoutRoot = calculateLayout(data, 0, 0);
      updateAbsolutePositions(layoutRoot, 0, 0);

      setRootNode(layoutRoot);
      setNodeMap(flattenGraph(layoutRoot));

      // Initial fit
      if (containerRef) {
        const cw = containerRef.clientWidth;
        const ch = containerRef.clientHeight;
        const scale = Math.min(
          (cw - 100) / layoutRoot.width,
          (ch - 100) / layoutRoot.height,
          1
        );
        setScale(Math.max(scale, 0.2));
        setTranslate({
          x: (cw - layoutRoot.width * scale) / 2,
          y: (ch - layoutRoot.height * scale) / 2,
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // --- Interaction ---

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(scale() + delta, 0.1), 3);

    // Zoom towards mouse pointer
    const rect = containerRef!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleRatio = newScale / scale();
    const newX = mouseX - (mouseX - translate().x) * scaleRatio;
    const newY = mouseY - (mouseY - translate().y) * scaleRatio;

    setScale(newScale);
    setTranslate({ x: newX, y: newY });
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setHasDragged(false);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning()) {
      setHasDragged(true);
      setTranslate((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  // --- Rendering Helpers ---

  function getNodeStyle(type?: string) {
    switch (type) {
      case "function":
        return { border: "#3b82f6", bg: "#1e3a8a33", label: "fn" };
      case "if":
        return { border: "#22c55e", bg: "#14532d33", label: "if" };
      case "else":
      case "else_branch":
        return { border: "#22c55e", bg: "#14532d33", label: "else" };
      case "try":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "try" };
      case "catch":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "catch" };
      case "finally":
        return { border: "#ef4444", bg: "#7f1d1d33", label: "finally" };
      case "variable":
      case "usage":
        return { border: "#94a3b8", bg: "#334155", label: "var" };
      default:
        return { border: "#64748b", bg: "#1e293b", label: type || "block" };
    }
  }

  // --- Arrows ---

  const activeEdges = () => {
    const hovered = hoveredNodeId();
    const root = rootNode();
    const map = nodeMap();
    if (!hovered || !root || !map) return [];

    const edges: RenderEdge[] = [];
    const visited = new Set<string>();

    // Find all edges connected to hovered node
    map.forEach((node) => {
      node.edges?.forEach((edge) => {
        if (edge.sources.includes(hovered) || edge.targets.includes(hovered)) {
          if (visited.has(edge.id)) return;
          visited.add(edge.id);

          const source = map.get(edge.sources[0]);
          const target = map.get(edge.targets[0]);

          if (source && target) {
            // Calculate path
            const sx = source.absX + source.width / 2;
            const sy = source.absY + source.height / 2;
            const tx = target.absX + target.width / 2;
            const ty = target.absY + target.height / 2;

            // Curved path
            const dx = tx - sx;
            const dy = ty - sy;
            const controlPointOffset =
              Math.max(Math.abs(dx), Math.abs(dy)) * 0.5;

            // Simple cubic bezier
            const d = `M ${sx} ${sy} C ${sx + controlPointOffset} ${sy}, ${
              tx - controlPointOffset
            } ${ty}, ${tx} ${ty}`;

            edges.push({ id: edge.id, d, type: edge.type });
          }
        }
      });
    });

    return edges;
  };

  const NodeRenderer = (props: { node: LayoutNode }) => {
    const style = getNodeStyle(props.node.type);
    const isPill =
      props.node.type === "variable" || props.node.type === "usage";
    const isGroup = props.node.isGroup;

    if (isGroup) {
      return (
        <div
          class="absolute"
          style={{
            left: `${props.node.x}px`,
            top: `${props.node.y}px`,
            width: `${props.node.width}px`,
            height: `${props.node.height}px`,
          }}
        >
          <For each={props.node.children}>
            {(child) => <NodeRenderer node={child} />}
          </For>
        </div>
      );
    }

    // Header Content
    const label = props.node.labels?.[0]?.text || props.node.id;

    return (
      <div
        class="absolute transition-colors duration-200"
        style={{
          left: `${props.node.x}px`,
          top: `${props.node.y}px`,
          width: `${props.node.width}px`,
          height: `${props.node.height}px`,
          border: `1px solid ${style.border}`,
          "background-color":
            hoveredNodeId() === props.node.id ? style.bg : "transparent",
          "border-radius": isPill ? "9999px" : "6px",
          "z-index": isPill ? 10 : 1,
        }}
        onMouseEnter={(e) => {
          e.stopPropagation();
          setHoveredNodeId(props.node.id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (hasDragged()) return;
          if (props.node.startLine) {
            setSelectedNode({
              path: props.node.path || rootNode()?.path || "",
              startLine: props.node.startLine,
              endLine: props.node.endLine,
            });
          }
        }}
      >
        {/* Header */}
        <div
          class="flex flex-col px-2 py-1 border-b border-white/10"
          style={{
            "border-color": style.border,
            "background-color": isPill ? style.bg : `${style.border}22`,
            "border-radius": isPill ? "9999px" : "5px 5px 0 0",
          }}
        >
          <div class="flex justify-between items-center">
            <span class="font-mono text-xs font-bold text-gray-200 truncate">
              {props.node.type === "if" ? "if" : label}
            </span>
            {!isPill && (
              <span class="text-[10px] opacity-60">{style.label}</span>
            )}
          </div>

          {/* Extra Header Info */}
          <Show when={props.node.type === "function"}>
            <span class="text-[10px] text-gray-400 font-mono pl-2 truncate">
              {props.node.params && props.node.params.length > 0
                ? `(${props.node.params.join(", ")})`
                : "()"}
            </span>
          </Show>
          <Show when={props.node.type === "if"}>
            <span class="text-[10px] text-gray-400 font-mono pl-2">
              {label !== "if" ? label : ""}
            </span>
          </Show>
        </div>

        {/* Children */}
        <Show when={props.node.children.length > 0}>
          <For each={props.node.children}>
            {(child) => <NodeRenderer node={child} />}
          </For>
        </Show>
      </div>
    );
  };

  return (
    <div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
      <div class="bg-[#0f172a] rounded-xl shadow-2xl w-[95vw] h-[95vh] flex flex-col overflow-hidden border border-gray-800">
        {/* Toolbar */}
        <div class="flex justify-between items-center p-4 border-b border-gray-800 bg-[#1e293b]">
          <h2 class="text-lg font-semibold text-gray-100">Data Flow Viz</h2>
          <div class="flex gap-4">
            <button
              onClick={props.onClose}
              class="text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        {/* Main Content Area (Split Pane) */}
        <div class="flex-1 flex overflow-hidden">
          {/* Graph Canvas */}
          <div
            ref={containerRef}
            class="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#0b1120]"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <Show
              when={!loading()}
              fallback={<div class="text-white p-10">Loading...</div>}
            >
              <Show
                when={rootNode()}
                fallback={
                  <div class="text-red-400 p-10">{error() || "No data"}</div>
                }
              >
                <div
                  style={{
                    transform: `translate(${translate().x}px, ${
                      translate().y
                    }px) scale(${scale()})`,
                    "transform-origin": "0 0",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                >
                  {/* 1. Render Nodes (DOM) */}
                  <NodeRenderer node={rootNode()!} />

                  {/* 2. Render Arrows (SVG Overlay) */}
                  <svg
                    class="absolute top-0 left-0 pointer-events-none overflow-visible"
                    style={{
                      width: `${rootNode()!.width}px`,
                      height: `${rootNode()!.height}px`,
                      "z-index": 100,
                    }}
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
                        <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
                      </marker>
                    </defs>
                    <For each={activeEdges()}>
                      {(edge) => (
                        <path
                          d={edge.d}
                          stroke="#60a5fa"
                          stroke-width="2"
                          fill="none"
                          marker-end="url(#arrowhead)"
                          class="drop-shadow-md"
                        />
                      )}
                    </For>
                  </svg>
                </div>
              </Show>
            </Show>
          </div>

          {/* Sidebar */}
          <Show when={selectedNode()} keyed>
            <CodeSidebar
              path={selectedNode()!.path}
              startLine={selectedNode()!.startLine}
              endLine={selectedNode()!.endLine}
              onClose={() => setSelectedNode(null)}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
