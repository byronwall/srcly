import {
  createEffect,
  onCleanup,
  onMount,
  createSignal,
  createMemo,
  untrack,
  Show,
  For,
  batch,
} from "solid-js";
import { createMutable } from "solid-js/store";
import * as d3 from "d3";
import { extractFilePath, filterData } from "../utils/dataProcessing";
import { HOTSPOT_METRICS, useMetricsStore } from "../utils/metricsStore";
import { truncateTextToWidth } from "../utils/svgText";
import { addScopeBodyDummyNodes } from "../viz/treemap/utils/tree";
import { resolveNodeByPath } from "../viz/treemap/utils/path";
import {
  treemapFillColor,
  treemapLabelColor,
} from "../viz/treemap/utils/colors";
import TreemapSvg from "../viz/treemap/components/TreemapSvg";
import DependencyGraph from "./DependencyGraph";
import DataFlowViz from "./DataFlowViz";
import FileTypeFilter from "./FileTypeFilter";
import Popover from "./Popover";

interface TreemapProps {
  data: any;
  currentRoot?: any;
  onZoom?: (node: any) => void;
  onFileSelect?: (path: string, startLine?: number, endLine?: number) => void;
  /**
   * Minimum on-screen size (in px) for a treemap node to be rendered into the DOM.
   * Nodes smaller than this in either dimension are skipped, but will appear once
   * zooming/layout makes them large enough.
   */
  minNodeRenderSizePx?: number;
}

/**
 * Produce a stable, collision-resistant key for a rendered treemap node.
 *
 * Why: some nodes (especially non-file scopes) may not have a `path`, and we used
 * to fall back to `name` which can collide across siblings when zooming out
 * (causing DOM remounts and transitions to "snap" instead of animate).
 */
const getStableNodeKey = (d: any): string => {
  const directPath = d?.data?.path;
  if (typeof directPath === "string" && directPath.length > 0) {
    return "node-" + directPath;
  }

  // Build a key from (nearest-ancestor path) + type/name + line range if present.
  // This remains stable across zoom levels because the nearest ancestor with a
  // `path` (typically the file) is stable, even if depth changes.
  const parts: string[] = [];
  let curr: any = d;
  let guard = 0;
  let anchorPath: string | null = null;

  while (curr && guard++ < 50) {
    const cd = curr.data || {};
    const t = cd.type || "node";
    const n = cd.name || "";
    const sl = cd.start_line ?? "";
    const el = cd.end_line ?? "";
    const loc = sl !== "" || el !== "" ? `@${sl}-${el}` : "";
    parts.push(`${t}:${n}${loc}`);

    const p = cd.path;
    if (typeof p === "string" && p.length > 0) {
      anchorPath = p;
      break;
    }
    curr = curr.parent;
  }

  const anchor = anchorPath ? `path=${anchorPath}` : "path=?";
  return "node-" + anchor + "/" + parts.reverse().join("/");
};

const NOMINAL_NODE_SIZE_PX = 100;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;

  const [dimensions, setDimensions] = createSignal({ width: 0, height: 0 });
  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [breadcrumbs, setBreadcrumbs] = createSignal<any[]>([]);
  const [activeExtensions, setActiveExtensions] = createSignal<string[]>([]);
  const [maxLoc, setMaxLoc] = createSignal<number | undefined>(undefined);
  const {
    selectedHotSpotMetrics,
    setSelectedHotSpotMetrics,
    toggleExcludedPath,
    excludedPaths,
  } = useMetricsStore();
  const primaryMetric = () => selectedHotSpotMetrics()[0] || "complexity";
  const [showLegend, setShowLegend] = createSignal(false);
  const [isAltPressed, setIsAltPressed] = createSignal(false);
  const [isIsolateMode, setIsIsolateMode] = createSignal(false);
  const [showMetricPopover, setShowMetricPopover] = createSignal(false);
  const [showDependencyGraph, setShowDependencyGraph] = createSignal(false);
  const [showDataFlow, setShowDataFlow] = createSignal(false);

  // Build a lookup of file-name -> metrics so the dependency graph can
  // reuse the same hotspot color scheme for its nodes.
  const fileMetricsByName = createMemo(() => {
    const root = props.data;
    const map = new Map<string, any>();

    if (!root) return map;

    const visit = (node: any) => {
      if (!node) return;
      if (node.type === "file" && node.metrics) {
        map.set(node.name, node.metrics);
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        node.children.forEach(visit);
      }
    };

    visit(root);
    return map;
  });

  // Handle key modifiers for isolate mode
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsIsolateMode(true);
      }
      if (e.key === "Alt") {
        setIsAltPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsIsolateMode(false);
      }
      if (e.key === "Alt") {
        setIsAltPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    });
  });

  // Handle resize
  onMount(() => {
    if (!containerRef) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(containerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

  // Initialize current root when data loads or updates
  createEffect(() => {
    const dataRoot = props.data;
    const requestedRoot = props.currentRoot;

    // When a specific currentRoot is requested (e.g. via zoom), try to
    // re-resolve it inside the *filtered* tree that Treemap receives as
    // props.data so that excluded paths really disappear from the view.
    if (requestedRoot && dataRoot) {
      const targetPath = requestedRoot.path;
      const resolved = resolveNodeByPath(dataRoot, targetPath);
      if (resolved) {
        setCurrentRoot(resolved.node);
        setBreadcrumbs(resolved.breadcrumbs);
        return;
      }

      // If the requested root no longer exists in the filtered tree (for
      // example because its path is excluded), fall back to the top-level root.
      // This also makes it easy to debug path mismatches.
      // eslint-disable-next-line no-console
      console.debug(
        "[Treemap] Requested currentRoot path not found in filtered data, falling back to root",
        {
          targetPath,
          dataRootPath: dataRoot.path,
        }
      );
    }

    if (dataRoot) {
      setCurrentRoot(dataRoot);
      setBreadcrumbs([dataRoot]);
    }
  });

  // Handle extension toggle
  const toggleExtension = (ext: string) => {
    const current = activeExtensions();
    if (current.includes(ext)) {
      setActiveExtensions(current.filter((e) => e !== ext));
    } else {
      setActiveExtensions([...current, ext]);
    }
  };

  function handleHierarchyClick(d: d3.HierarchyNode<any>, event: MouseEvent) {
    // Check for modifier keys (CMD on Mac, CTRL on Windows/Linux)
    const isModifierPressed = event.metaKey || event.ctrlKey;
    const isAlt = event.altKey;

    if (isAlt) {
      // Exclude item
      if (d.data.path) {
        toggleExcludedPath(d.data.path);
      }
      return;
    }

    if (isModifierPressed) {
      // Isolate mode: Zoom into the node
      if (props.onZoom) props.onZoom(d.data);
      else zoomToNode(d.data);
      return;
    }

    if (!props.onFileSelect) return;

    // Default behavior:
    // If it's a folder, zoom in
    if (d.data.type === "folder") {
      if (props.onZoom) props.onZoom(d.data);
      else zoomToNode(d.data);
      return;
    }

    // If it's a file or a leaf node (function/chunk), select it
    // Leaf nodes might not have a type, or might be "function" etc.
    // We assume anything not a folder is selectable content.
    const nodeType = d.data?.type as string | undefined;
    const filePath = extractFilePath(
      d.data?.path as string | undefined,
      nodeType
    );

    if (filePath) {
      const startLine = d.data?.start_line as number | undefined;
      const endLine = d.data?.end_line as number | undefined;
      props.onFileSelect(filePath, startLine, endLine);
    }
  }

  function zoomToNode(nodeData: any) {
    if (props.onZoom) {
      props.onZoom(nodeData);
      return;
    }
    setCurrentRoot(nodeData);

    // Reconstruct breadcrumbs path using path string matching because d3 creates a copy
    // of the data, so object identity fails.
    const targetPath = nodeData.path;
    if (props.data && targetPath) {
      const resolved = resolveNodeByPath(props.data, targetPath);
      if (resolved) {
        setBreadcrumbs(resolved.breadcrumbs);
        return;
      }
    } else if (props.data) {
      // Fallback if no path (shouldn't happen for folders)
      setBreadcrumbs([props.data]);
    }
  }

  // --- Layout Calculation ---

  const processedData = createMemo(() => {
    const rootData = currentRoot();
    if (!rootData) return null;

    // Apply filters
    const filteredData = filterData(JSON.parse(JSON.stringify(rootData)), {
      extensions: activeExtensions(),
      maxLoc: maxLoc(),
      excludedPaths: excludedPaths(),
    });

    if (!filteredData) return null;

    // Add synthetic "body" children for scopes (functions/files)
    return addScopeBodyDummyNodes(filteredData);
  });

  const layoutRoot = createMemo(() => {
    const data = processedData();
    const { width, height } = dimensions();

    if (!data || width === 0 || height === 0) return null;

    const root = d3
      .hierarchy(data)
      // Only count LOC on leaf nodes so container values are the sum of their leaves
      .sum((d: any) => {
        if (!d || !d.metrics) return 0;
        const hasChildren = Array.isArray(d.children) && d.children.length > 0;
        if (!hasChildren) {
          return d.metrics.loc || 0;
        }
        return 0;
      })
      .sort((a, b) => {
        const aIsBody =
          a.data?.type === "function_body" || a.data?.name === "(body)";
        const bIsBody =
          b.data?.type === "function_body" || b.data?.name === "(body)";

        // Always place synthetic body nodes last so their (hidden) rectangles
        // cluster toward the bottom-left, and visible children pack toward
        // the top-left of each parent.
        if (aIsBody && !bIsBody) return 1;
        if (!aIsBody && bIsBody) return -1;
        return (b.value || 0) - (a.value || 0);
      });

    d3
      .treemap()
      .size([width, height])
      .paddingOuter(4)
      .paddingTop(20) // Space for folder labels
      .paddingInner(2)
      .round(true)
      .tile(d3.treemapBinary)(root);

    return root as d3.HierarchyRectangularNode<any>;
  });

  // Cache to maintain stable object references for CSS transitions
  const nodeCache = new Map<string, any>();

  const nodes = createMemo(() => {
    const root = layoutRoot();
    if (!root) return [];

    const descendants = root
      .descendants()
      .filter(
        (d) => d.data?.type !== "function_body" && d.data?.name !== "(body)"
      );

    const newCache = new Map<string, any>();
    const result: any[] = [];

    // Use batch to effectively group updates (though strictly reactive graph handles this)
    batch(() => {
      for (const d of descendants) {
        const key = getStableNodeKey(d);

        let node = nodeCache.get(key);
        if (node) {
          // Update existing mutable node in-place
          Object.assign(node, d);
          node.data = d.data;
        } else {
          // Create new mutable node
          node = createMutable(d);
          nodeCache.set(key, node);
        }
        node.__key = key;
        newCache.set(key, node);
        result.push(node);
      }
    });

    // Prune cache of removed nodes
    for (const k of nodeCache.keys()) {
      if (!newCache.has(k)) {
        nodeCache.delete(k);
      }
    }

    return result;
  });

  // --- Enter/Exit animation helpers ---
  // Problem: when zooming "out" across big hierarchy jumps (e.g. from inside a file
  // straight to an ancestor folder), most nodes are brand new. They previously just
  // popped in/out. We keep the existing per-node transform transitions, but add:
  // - entering nodes: start at the center of their final rect w/ tiny scale, then
  //   on next RAF animate to final position/scale.
  // - exiting nodes: keep old nodes around briefly and collapse them to center.
  const TRANSITION_MS = 500;
  const TINY_SCALE = 0.001;

  const [enteringKeys, setEnteringKeys] = createSignal<Set<string>>(new Set());
  const [exitingNodes, setExitingNodes] = createSignal<any[]>([]);
  const [collapsedExitKeys, setCollapsedExitKeys] = createSignal<Set<string>>(
    new Set()
  );

  let prevKeys = new Set<string>();
  let prevNodesByKey = new Map<string, any>();
  let animToken = 0;

  createEffect(() => {
    const currentNodes = nodes();
    const currKeys = new Set<string>();
    const currByKey = new Map<string, any>();

    for (const n of currentNodes) {
      const k = (n as any).__key ?? getStableNodeKey(n);
      (n as any).__key = k;
      currKeys.add(k);
      currByKey.set(k, n);
    }

    // If a key reappears while it's still exiting, drop the exiting copy.
    const existingExits = untrack(() => exitingNodes());
    if (existingExits.length) {
      const filtered = existingExits.filter((n) => !currKeys.has(n.__key));
      if (filtered.length !== existingExits.length) {
        setExitingNodes(filtered);
        setCollapsedExitKeys((prev) => {
          const next = new Set(prev);
          for (const n of existingExits) {
            if (!filtered.includes(n)) next.delete(n.__key);
          }
          return next;
        });
      }
    }

    const newKeys: string[] = [];
    for (const k of currKeys) {
      if (!prevKeys.has(k)) newKeys.push(k);
    }

    const removedKeys: string[] = [];
    for (const k of prevKeys) {
      if (!currKeys.has(k)) removedKeys.push(k);
    }

    // ENTER: apply initial center/tiny scale, then animate to final on next frame.
    if (newKeys.length) {
      setEnteringKeys(new Set<string>(newKeys));
      const token = ++animToken;
      requestAnimationFrame(() => {
        if (token !== animToken) return;
        setEnteringKeys(new Set<string>());
      });
    }

    // EXIT: keep removed nodes around and collapse them to center, then remove.
    if (removedKeys.length) {
      const removedNodes = removedKeys
        .map((k) => prevNodesByKey.get(k))
        .filter(Boolean)
        .map((n) => {
          n.__key = n.__key || "node-" + (n.data?.path || n.data?.name);
          n.__exit = true;
          return n;
        });

      if (removedNodes.length) {
        setExitingNodes((prev) => {
          const seen = new Set(prev.map((n) => n.__key));
          const merged = [...prev];
          for (const n of removedNodes) {
            if (!seen.has(n.__key)) merged.push(n);
          }
          return merged;
        });

        const token = ++animToken;
        requestAnimationFrame(() => {
          if (token !== animToken) return;
          setCollapsedExitKeys((prev) => {
            const next = new Set(prev);
            for (const k of removedKeys) next.add(k);
            return next;
          });
        });

        setTimeout(() => {
          setExitingNodes((prev) =>
            prev.filter((n) => !removedKeys.includes(n.__key))
          );
          setCollapsedExitKeys((prev) => {
            const next = new Set(prev);
            for (const k of removedKeys) next.delete(k);
            return next;
          });
        }, TRANSITION_MS + 30);
      }
    }

    prevKeys = currKeys;
    prevNodesByKey = currByKey;
  });

  const renderNodes = createMemo(() => {
    // Render exiting nodes too so they can animate out.
    const exits = exitingNodes();
    const all = exits.length ? [...exits, ...nodes()] : nodes();
    return all;
  });

  // --- Tooltip ---

  function showTooltip(e: MouseEvent, d: d3.HierarchyNode<any>) {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "1";
    tooltipRef.style.left = e.pageX + 10 + "px";
    tooltipRef.style.top = e.pageY + 10 + "px";

    if (d.data.type === "folder") {
      const subFolders = d
        .descendants()
        .filter((n) => n.data.type === "folder" && n !== d).length;
      const subFiles = d
        .descendants()
        .filter((n) => n.data.type === "file").length;

      tooltipRef.innerHTML = `<strong>${d.data.name}</strong><br>Total LOC: ${d.value}<br>Sub-folders: ${subFolders}<br>Sub-files: ${subFiles}`;
    } else {
      let content = `<strong>${d.data.name}</strong><br>LOC: ${
        d.value
      }<br>Complexity: ${(d.data.metrics?.complexity || 0).toFixed(
        1
      )}<br>Density: ${((d.data.metrics?.comment_density || 0) * 100).toFixed(
        0
      )}%<br>Depth: ${d.data.metrics?.max_nesting_depth || 0}<br>TODOs: ${
        d.data.metrics?.todo_count || 0
      }`;

      const metricId = primaryMetric();
      const standardMetrics = [
        "loc",
        "complexity",
        "comment_density",
        "max_nesting_depth",
        "todo_count",
      ];
      if (!standardMetrics.includes(metricId)) {
        const val = (d.data.metrics as any)?.[metricId];
        if (val !== undefined) {
          const label =
            HOTSPOT_METRICS.find((m) => m.id === metricId)?.label || metricId;
          // Format number if needed
          const displayVal =
            typeof val === "number" && !Number.isInteger(val)
              ? val.toFixed(2)
              : val;
          content += `<br>${label}: ${displayVal}`;
        }
      }

      tooltipRef.innerHTML = content;
    }
  }

  function hideTooltip() {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "0";
  }

  const getRelativeDepth = (d: d3.HierarchyNode<any>) => {
    let curr: d3.HierarchyNode<any> | null = d;
    while (curr) {
      if (curr.data.type === "file") {
        return d.depth - curr.depth;
      }
      curr = curr.parent;
    }
    return d.depth;
  };

  // --- Color Logic ---
  const getNodeColor = (d: d3.HierarchyNode<any>) => {
    if (d.data.type === "folder") return "#1e1e1e";

    const metricId = primaryMetric();
    const metrics = d.data.metrics || {};
    return treemapFillColor(metricId, metrics, getRelativeDepth(d));
  };

  const getNodeStroke = (d: d3.HierarchyNode<any>) => {
    return d.data.type === "folder" ? "#333" : "#121212";
  };

  const getNodeStrokeWidth = (d: d3.HierarchyNode<any>) => {
    return d.data.type === "folder" ? 1 : 0.5;
  };

  const getNodeTextColor = (d: d3.HierarchyNode<any>) => {
    if (d.data.type === "folder") return "#1e1e1e"; // Not used for folder labels usually

    const metricId = primaryMetric();
    const metrics = d.data.metrics || {};
    return treemapLabelColor(metricId, metrics, getRelativeDepth(d));
  };

  const getChunkLabelColor = (d: d3.HierarchyNode<any>) => {
    // Similar to getNodeTextColor but with alpha
    if (d.data.type === "folder") return "#1e1e1e";

    const metricId = primaryMetric();
    const metrics = d.data.metrics || {};
    return treemapLabelColor(metricId, metrics, getRelativeDepth(d), 0.7);
  };

  const getLabel = (
    d: d3.HierarchyNode<any>,
    kind: "folder" | "file" | "chunk"
  ) => {
    const name = String(d.data?.name ?? "");
    const w = Math.max(0, (d as any).x1 - (d as any).x0);
    const h = Math.max(0, (d as any).y1 - (d as any).y0);
    // Padding inside the rect (match x used by <text>)
    const padLeft = kind === "chunk" ? 2 : 4;
    const padRight = 4;
    const maxWidth = w - padLeft - padRight;

    // Size text from the *real* dimensions (not the nominal scaled box).
    // Keep within a conservative range to avoid noisy size changes.
    const minDim = Math.min(w, h);
    const fontSize =
      kind === "folder"
        ? clamp(minDim / 6, 9, 14)
        : kind === "file"
        ? clamp(minDim / 7, 8, 12)
        : clamp(minDim / 6, 8, 13);
    const roundedFontSize = Math.round(fontSize * 2) / 2;
    const fontWeight = kind === "folder" ? "700" : "400";
    const fontFamily = "sans-serif";
    const font = `${fontWeight} ${roundedFontSize}px ${fontFamily}`;

    return truncateTextToWidth(name, maxWidth, font);
  };

  const getLabelFontSizePx = (
    d: d3.HierarchyNode<any>,
    kind: "folder" | "file" | "chunk"
  ) => {
    const w = Math.max(0, (d as any).x1 - (d as any).x0);
    const h = Math.max(0, (d as any).y1 - (d as any).y0);
    const minDim = Math.min(w, h);
    const fontSize =
      kind === "folder"
        ? clamp(minDim / 6, 9, 14)
        : kind === "file"
        ? clamp(minDim / 7, 8, 12)
        : clamp(minDim / 6, 8, 13);
    // Round a bit for more stable layout / measuring cache hits.
    return Math.round(fontSize * 2) / 2;
  };

  const minNodeRenderSizePx = () => props.minNodeRenderSizePx ?? 4;

  return (
    <div class="flex flex-col w-full h-full overflow-hidden border border-gray-700 rounded bg-[#121212] relative">
      {/* Header Bar */}
      <div class="flex items-center justify-between px-3 py-2 bg-[#1e1e1e] border-b border-[#333]">
        {/* Breadcrumbs */}
        <div class="flex items-center gap-1 overflow-x-auto text-sm scrollbar-hide">
          <For each={breadcrumbs()}>
            {(node, i) => (
              <div class="flex items-center whitespace-nowrap">
                <button
                  class="hover:text-blue-400 hover:underline text-gray-300"
                  onClick={() => zoomToNode(node)}
                >
                  {node.name || "root"}
                </button>
                <Show when={i() < breadcrumbs().length - 1}>
                  <span class="mx-1 text-gray-600">/</span>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Filters */}
        <div class="ml-4">
          <FileTypeFilter
            data={props.data}
            activeExtensions={activeExtensions()}
            onToggleExtension={toggleExtension}
            onClearExtensions={() => setActiveExtensions([])}
            maxLoc={maxLoc()}
            onMaxLocChange={setMaxLoc}
          />
        </div>

        {/* Color Metric (linked to Hot Spot metrics) */}
        <div class="flex items-center gap-1 ml-4 relative">
          <button
            class="text-xs text-gray-500 mr-2 uppercase tracking-wider cursor-help hover:text-gray-300 border-b border-dotted border-gray-600"
            onMouseEnter={() => setShowLegend(true)}
            onMouseLeave={() => setShowLegend(false)}
          >
            Color:
          </button>
          <Popover
            isOpen={showMetricPopover()}
            onOpenChange={setShowMetricPopover}
            placement="bottom-end"
            offset={{ x: 0, y: 4 }}
            trigger={(triggerProps) => (
              <button
                ref={triggerProps.ref}
                type="button"
                class="bg-[#252526] border border-[#3e3e42] text-gray-400 text-xs rounded px-2 py-0.5 outline-none flex items-center gap-1 hover:border-blue-500 hover:text-blue-200"
                onClick={(e) => triggerProps.onClick(e)}
              >
                <span class="truncate max-w-[140px]">
                  {HOTSPOT_METRICS.find((m) => m.id === primaryMetric())
                    ?.label ?? "Select metric"}
                </span>
                <span class="text-[9px]">▼</span>
              </button>
            )}
          >
            <div class="bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 p-2 w-56">
              <div class="text-xs font-bold text-gray-400 mb-2">
                Hot Spot Metrics
              </div>
              <div class="max-h-64 overflow-y-auto space-y-1">
                <For each={HOTSPOT_METRICS}>
                  {(metric) => {
                    const isSelected = () =>
                      selectedHotSpotMetrics().includes(metric.id);
                    const toggleMetric = () => {
                      const current = selectedHotSpotMetrics();
                      if (isSelected()) {
                        if (current.length > 1) {
                          setSelectedHotSpotMetrics(
                            current.filter((m) => m !== metric.id)
                          );
                        }
                      } else {
                        setSelectedHotSpotMetrics([...current, metric.id]);
                      }
                    };
                    return (
                      <button
                        type="button"
                        class={`w-full flex items-center justify-between text-left text-[11px] px-2 py-1 rounded ${
                          isSelected()
                            ? "bg-blue-900/60 text-blue-100"
                            : "text-gray-300 hover:bg-[#333]"
                        }`}
                        onClick={toggleMetric}
                      >
                        <span>{metric.label}</span>
                        <span
                          class={`ml-2 text-[10px] ${
                            isSelected() ? metric.color : "text-gray-500"
                          }`}
                        >
                          {isSelected() ? "●" : "○"}
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Popover>
        </div>

        {/* View Dependencies Button */}
        <div class="ml-4 pl-4 border-l border-[#333] flex gap-2">
          <button
            class={`px-3 py-1 text-xs rounded border transition-colors ${
              showDependencyGraph()
                ? "bg-purple-900 border-purple-700 text-purple-100"
                : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
            }`}
            onClick={() => {
              setShowDependencyGraph(!showDependencyGraph());
              setShowDataFlow(false);
            }}
          >
            View Dependencies
          </button>

          <button
            class={`px-3 py-1 text-xs rounded border transition-colors ${
              showDataFlow()
                ? "bg-teal-900 border-teal-700 text-teal-100"
                : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
            }`}
            onClick={() => {
              setShowDataFlow(!showDataFlow());
              setShowDependencyGraph(false);
            }}
          >
            Data Flow
          </button>
        </div>

        {/* Legend Tooltip */}
        <Show when={showLegend()}>
          <div class="absolute top-10 right-4 z-50 bg-[#252526] border border-[#3e3e42] p-3 rounded shadow-xl text-xs w-64">
            <div class="font-bold mb-2 text-gray-300 border-b border-[#3e3e42] pb-1">
              {HOTSPOT_METRICS.find((m) => m.id === primaryMetric())?.label ||
                "Metric"}
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-[#569cd6]"></div>
                <span>Lower score</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-[#dcdcaa]"></div>
                <span>Medium score</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 bg-[#ce9178]"></div>
                <span>Higher score</span>
              </div>
            </div>
          </div>
        </Show>
      </div>

      <div ref={containerRef} class="flex-1 relative overflow-hidden">
        <Show when={showDependencyGraph()}>
          <DependencyGraph
            path={currentRoot()?.path}
            primaryMetricId={primaryMetric()}
            fileMetricsByName={fileMetricsByName()}
            onClose={() => setShowDependencyGraph(false)}
          />
        </Show>
        <Show when={showDataFlow()}>
          <DataFlowViz
            path={currentRoot()?.path}
            onClose={() => setShowDataFlow(false)}
          />
        </Show>
        <Show
          when={!showDependencyGraph() && !showDataFlow() && processedData()}
        >
          <TreemapSvg
            width={dimensions().width}
            height={dimensions().height}
            renderNodes={renderNodes}
            minNodeRenderSizePx={minNodeRenderSizePx}
            nominalNodeSizePx={NOMINAL_NODE_SIZE_PX}
            tinyScale={TINY_SCALE}
            isAltPressed={isAltPressed}
            isIsolateMode={isIsolateMode}
            enteringKeys={enteringKeys}
            collapsedExitKeys={collapsedExitKeys}
            getStableNodeKey={getStableNodeKey}
            getNodeColor={getNodeColor}
            getNodeStroke={getNodeStroke}
            getNodeStrokeWidth={getNodeStrokeWidth}
            getNodeTextColor={getNodeTextColor}
            getChunkLabelColor={getChunkLabelColor}
            getLabel={getLabel}
            getLabelFontSizePx={getLabelFontSizePx}
            onNodeClick={handleHierarchyClick}
            onNodeMouseEnter={showTooltip}
            onNodeMouseLeave={hideTooltip}
          />
        </Show>
        <Show
          when={!processedData() && !showDependencyGraph() && !showDataFlow()}
        >
          <div class="flex items-center justify-center h-full text-gray-500">
            No files match the selected filters
          </div>
        </Show>
      </div>
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200 text-sm"
      />
    </div>
  );
}
