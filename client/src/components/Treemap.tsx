import {
  createEffect,
  onCleanup,
  onMount,
  createSignal,
  createMemo,
  Show,
  For,
} from "solid-js";
import * as d3 from "d3";
import { extractFilePath, filterByExtension } from "../utils/dataProcessing";
import { HOTSPOT_METRICS, useMetricsStore } from "../utils/metricsStore";
import DependencyGraph from "./DependencyGraph";

interface TreemapProps {
  data: any;
  currentRoot?: any;
  onZoom?: (node: any) => void;
  onFileSelect?: (path: string, startLine?: number, endLine?: number) => void;
}

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "css", "json", "py", "md"];

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;

  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [breadcrumbs, setBreadcrumbs] = createSignal<any[]>([]);
  const [activeExtensions, setActiveExtensions] = createSignal<string[]>([]);
  const { selectedHotSpotMetrics, setSelectedHotSpotMetrics } =
    useMetricsStore();
  const primaryMetric = () => selectedHotSpotMetrics()[0] || "complexity";
  const [showLegend, setShowLegend] = createSignal(false);
  const [isIsolateMode, setIsIsolateMode] = createSignal(false);
  const [showMetricPopover, setShowMetricPopover] = createSignal(false);
  const [showDependencyGraph, setShowDependencyGraph] = createSignal(false);

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
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsIsolateMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    });
  });

  const getContrastingTextColor = (bgColor: string, alpha = 1) => {
    const base = d3.hsl(bgColor);

    // Drive text toward near-black or near-white while preserving hue for subtle color harmony.
    // This strongly increases contrast versus the background.
    const lightBackground = base.l >= 0.5;
    const targetLightness = lightBackground ? 0.12 : 0.9;

    const textColor = d3.hsl(base.h, base.s * 0.9, targetLightness).rgb();
    return `rgba(${Math.round(textColor.r)}, ${Math.round(
      textColor.g
    )}, ${Math.round(textColor.b)}, ${alpha})`;
  };

  /**
   * For each function node, add a synthetic "body" child that represents
   * the function's own LOC so that nested children do not completely fill
   * the function's rectangle in the treemap.
   */
  const addFunctionBodyDummyNodes = (node: any): any => {
    if (!node) return node;

    const clone: any = {
      ...node,
      // Always clone children array so we never mutate the original data.
      children: Array.isArray(node.children) ? [...node.children] : [],
    };

    if (clone.type === "function") {
      const loc = clone.metrics?.loc || 0;
      const hasChildren =
        Array.isArray(clone.children) && clone.children.length > 0;
      const alreadyHasBodyChild =
        hasChildren &&
        clone.children.some((child: any) => child?.type === "function_body");

      // Only add a dummy body node if there are other children to displace.
      // If there are no children, this node is a leaf and doesn't need a dummy body.
      if (loc > 0 && hasChildren && !alreadyHasBodyChild) {
        const bodyChild = {
          name: "(body)",
          path: `${clone.path || clone.name || ""}::(body)`,
          type: "function_body",
          metrics: {
            ...(clone.metrics || {}),
            loc,
          },
          start_line: clone.start_line,
          end_line: clone.end_line,
          children: [],
        };
        clone.children.push(bodyChild);
      }
    }

    if (clone.children && clone.children.length > 0) {
      clone.children = clone.children.map((child: any) =>
        addFunctionBodyDummyNodes(child)
      );
    }

    return clone;
  };

  // Color scales
  const complexityColor = d3
    .scaleLinear<string>()
    .domain([0, 10, 50])
    .range(["#569cd6", "#dcdcaa", "#ce9178"])
    .clamp(true);

  const commentDensityColor = d3
    .scaleLinear<string>()
    .domain([0, 0.2, 0.5])
    .range(["#ffcccc", "#ff9999", "#ff0000"]) // Light red to dark red
    .clamp(true);

  const nestingDepthColor = d3
    .scaleLinear<string>()
    .domain([0, 3, 8])
    .range(["#e0f7fa", "#4dd0e1", "#006064"]) // Cyan gradient
    .clamp(true);

  const todoCountColor = d3
    .scaleLinear<string>()
    .domain([0, 1, 5])
    .range(["#f1f8e9", "#aed581", "#33691e"]) // Green gradient (or maybe orange?)
    .clamp(true);

  // Initialize current root when data loads or updates
  createEffect(() => {
    if (props.currentRoot) {
      setCurrentRoot(props.currentRoot);
      // Reconstruct breadcrumbs
      const path: any[] = [];
      const targetPath = props.currentRoot.path;

      function findPath(root: any, target: string, current: any[]): boolean {
        if (root.path === target) {
          path.push(...current, root);
          return true;
        }
        if (root.children) {
          for (const child of root.children) {
            if (findPath(child, target, [...current, root])) return true;
          }
        }
        return false;
      }

      if (props.data && targetPath) {
        findPath(props.data, targetPath, []);
        setBreadcrumbs(path);
      } else {
        setBreadcrumbs([props.currentRoot]);
      }
    } else if (props.data) {
      setCurrentRoot(props.data);
      setBreadcrumbs([props.data]);
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

    // Reconstruct breadcrumbs path using path string matching
    // because d3 creates a copy of the data, so object identity fails.
    const path: any[] = [];
    const targetPath = nodeData.path;

    function findPath(
      root: any,
      targetPath: string,
      currentPath: any[]
    ): boolean {
      if (root.path === targetPath) {
        path.push(...currentPath, root);
        return true;
      }
      if (root.children) {
        for (const child of root.children) {
          if (findPath(child, targetPath, [...currentPath, root])) return true;
        }
      }
      return false;
    }

    if (props.data && targetPath) {
      findPath(props.data, targetPath, []);
      setBreadcrumbs(path);
    } else if (props.data) {
      // Fallback if no path (shouldn't happen for folders)
      setBreadcrumbs([props.data]);
    }
  }

  function renderTreemap(rootData: any) {
    if (!containerRef || !rootData) return;

    const w = containerRef.clientWidth;
    const h = containerRef.clientHeight;

    if (w === 0 || h === 0) return;

    // Clear previous
    d3.select(containerRef).html("");

    // Apply extension filter
    const filteredData =
      activeExtensions().length > 0
        ? filterByExtension(
            JSON.parse(JSON.stringify(rootData)),
            activeExtensions()
          )
        : rootData;

    if (!filteredData) {
      d3.select(containerRef)
        .append("div")
        .attr("class", "flex items-center justify-center h-full text-gray-500")
        .text("No files match the selected filters");
      return;
    }

    // Add synthetic "body" children to function nodes so their own LOC
    // is represented as area in the treemap, separate from nested children.
    const hierarchyInput = addFunctionBodyDummyNodes(filteredData);

    const root = d3
      .hierarchy(hierarchyInput)
      // Only count LOC on leaf nodes so container values are the sum of their leaves
      .sum((d: any) => {
        if (!d || !d.metrics) return 0;
        const hasChildren = Array.isArray(d.children) && d.children.length > 0;
        if (!hasChildren) {
          return d.metrics.loc || 0;
        }
        return 0;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3
      .treemap()
      .size([w, h])
      .paddingOuter(4)
      .paddingTop(20) // Space for folder labels
      .paddingInner(2)
      .round(true)
      .tile(d3.treemapBinary)(root);

    const svg = d3
      .select(containerRef)
      .append("svg")
      .attr("width", w)
      .attr("height", h)
      .style("shape-rendering", "crispEdges")
      .style("font-family", "sans-serif");

    // Cast to Rectangular node
    const rootRect = root as d3.HierarchyRectangularNode<any>;
    // Skip the synthetic/top-level root so the treemap starts at its children
    const allNodes = rootRect.descendants().filter((d) => d.depth > 0);

    // Groups for folders
    const cell = svg
      .selectAll("g")
      .data(allNodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    // Draw rects
    const rects = cell
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d) => {
        if (d.data.type === "folder") return "#1e1e1e";
        if (d.data.name === "(misc/imports)") return "#444";

        const metricId = primaryMetric();
        const metrics = d.data.metrics || {};
        let rawVal = (metrics as any)[metricId] ?? 0;

        const def = HOTSPOT_METRICS.find((m) => m.id === metricId);
        if (def?.invert) {
          rawVal = 1 - (rawVal || 0);
        }

        if (!isFinite(rawVal) || rawVal < 0) rawVal = 0;

        // Map normalized-ish score into complexity-like palette.
        // We don't know global max here, so we clamp a few reasonable breakpoints.
        const scaled =
          typeof rawVal === "number"
            ? Math.min(rawVal, 50)
            : Number(rawVal) || 0;

        if (metricId === "comment_density") {
          return commentDensityColor(metrics.comment_density || 0);
        }
        if (metricId === "max_nesting_depth") {
          return nestingDepthColor(metrics.max_nesting_depth || 0);
        }
        if (metricId === "todo_count") {
          return todoCountColor(metrics.todo_count || 0);
        }

        return complexityColor(scaled);
      })
      .attr("stroke", (d) => {
        // Only highlight files (not folders) that are large
        if (d.data.type !== "folder" && d.data.metrics?.loc > 2000)
          return "#ff0000";
        return d.data.type === "folder" ? "#333" : "#121212";
      })
      .attr("stroke-width", (d) => {
        if (d.data.type !== "folder" && d.data.metrics?.loc > 2000) return 2;
        return d.data.type === "folder" ? 1 : 0.5;
      })
      .on("click", (e, d) => {
        e.stopPropagation();
        handleHierarchyClick(d, e);
      })
      .on("mouseover", (e, d) => {
        // Show tooltip for files AND leaf nodes (anything not a folder)
        if (d.data.type !== "folder") showTooltip(e, d);
      })
      .on("mouseout", hideTooltip);

    // Apply reactive styles for isolate mode
    createEffect(() => {
      const isolate = isIsolateMode();
      rects.style("cursor", (d) => {
        if (isolate) return "zoom-in";
        return d.data.type === "folder" ? "zoom-in" : "pointer";
      });

      if (isolate) {
        rects.attr("fill-opacity", 0.8); // Dim slightly to show "mode change"
      } else {
        rects.attr("fill-opacity", 1);
      }
    });

    // Folder Labels
    cell
      .filter(
        (d) => d.data.type === "folder" && d.x1 - d.x0 > 30 && d.y1 - d.y0 > 20
      )
      .append("text")
      .attr("x", 4)
      .attr("y", 13)
      .text((d) => d.data.name)
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .attr("fill", "#888")
      .style("pointer-events", "none");

    // File Labels
    cell
      .filter(
        (d) => d.data.type === "file" && d.x1 - d.x0 > 40 && d.y1 - d.y0 > 15
      )
      .append("text")
      .attr("x", 4)
      .attr("y", 13)
      .text((d) => d.data.name)
      .attr("font-size", "10px")
      .attr("font-size", "10px")
      .attr("fill", (d) =>
        getContrastingTextColor(
          (() => {
            if (d.data.type === "folder") return "#1e1e1e";
            if (d.data.name === "(misc/imports)") return "#444";

            const metricId = primaryMetric();
            const metrics = d.data.metrics || {};

            if (metricId === "comment_density") {
              return commentDensityColor(metrics.comment_density || 0);
            }
            if (metricId === "max_nesting_depth") {
              return nestingDepthColor(metrics.max_nesting_depth || 0);
            }
            if (metricId === "todo_count") {
              return todoCountColor(metrics.todo_count || 0);
            }
            return complexityColor(metrics[metricId] || 0);
          })()
        )
      )
      .style("pointer-events", "none");

    // Code Chunk Labels (when zoomed in)
    // We can check depth or size to decide when to show labels for smaller chunks
    cell
      .filter(
        (d) =>
          d.data.type !== "folder" &&
          d.data.type !== "file" &&
          d.x1 - d.x0 > 50 &&
          d.y1 - d.y0 > 20
      )
      .append("text")
      .attr("x", 2)
      .attr("y", 10)
      .text((d) => d.data.name)
      .attr("font-size", "11px")
      .attr("fill", (d) =>
        getContrastingTextColor(
          (() => {
            if (d.data.type === "folder") return "#1e1e1e";
            if (d.data.name === "(misc/imports)") return "#444";

            const metricId = primaryMetric();
            const metrics = d.data.metrics || {};

            if (metricId === "comment_density") {
              return commentDensityColor(metrics.comment_density || 0);
            }
            if (metricId === "max_nesting_depth") {
              return nestingDepthColor(metrics.max_nesting_depth || 0);
            }
            if (metricId === "todo_count") {
              return todoCountColor(metrics.todo_count || 0);
            }
            return complexityColor(metrics[metricId] || 0);
          })(),
          0.7
        )
      )
      .style("pointer-events", "none")
      .style("overflow", "hidden");
  }

  function showTooltip(e: MouseEvent, d: d3.HierarchyNode<any>) {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "1";
    tooltipRef.style.left = e.pageX + 10 + "px";
    tooltipRef.style.top = e.pageY + 10 + "px";
    tooltipRef.innerHTML = `<strong>${d.data.name}</strong><br>LOC: ${
      d.value
    }<br>Complexity: ${d.data.metrics?.complexity || 0}<br>Density: ${(
      (d.data.metrics?.comment_density || 0) * 100
    ).toFixed(0)}%<br>Depth: ${
      d.data.metrics?.max_nesting_depth || 0
    }<br>TODOs: ${d.data.metrics?.todo_count || 0}`;
  }

  function hideTooltip() {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "0";
  }

  createEffect(() => {
    if (currentRoot() && !showDependencyGraph()) {
      renderTreemap(currentRoot());
    }
  });

  // Handle resize
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (currentRoot() && !showDependencyGraph()) {
        renderTreemap(currentRoot());
      }
    });
    if (containerRef) resizeObserver.observe(containerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

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
        <div class="flex items-center gap-1 ml-4">
          <span class="text-xs text-gray-500 mr-2 uppercase tracking-wider">
            Filter:
          </span>
          <For each={EXTENSIONS}>
            {(ext) => (
              <button
                class={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  activeExtensions().includes(ext)
                    ? "bg-blue-900 border-blue-700 text-blue-100"
                    : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
                }`}
                onClick={() => toggleExtension(ext)}
              >
                .{ext}
              </button>
            )}
          </For>
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
          <button
            type="button"
            class="bg-[#252526] border border-[#3e3e42] text-gray-400 text-xs rounded px-2 py-0.5 outline-none flex items-center gap-1 hover:border-blue-500 hover:text-blue-200"
            onClick={() => setShowMetricPopover(!showMetricPopover())}
          >
            <span class="truncate max-w-[140px]">
              {HOTSPOT_METRICS.find((m) => m.id === primaryMetric())?.label ??
                "Select metric"}
            </span>
            <span class="text-[9px]">▼</span>
          </button>
          <Show when={showMetricPopover()}>
            <div class="absolute right-0 top-7 mt-1 bg-[#252526] border border-[#3e3e42] rounded shadow-xl z-50 p-2 w-56">
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
          </Show>
        </div>

        {/* View Dependencies Button */}
        <div class="ml-4 pl-4 border-l border-[#333]">
          <button
            class={`px-3 py-1 text-xs rounded border transition-colors ${
              showDependencyGraph()
                ? "bg-purple-900 border-purple-700 text-purple-100"
                : "bg-[#252526] border-[#3e3e42] text-gray-400 hover:bg-[#2d2d2d]"
            }`}
            onClick={() => setShowDependencyGraph(!showDependencyGraph())}
          >
            View Dependencies
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
            fileMetricsByName={fileMetricsByName()}
            onClose={() => setShowDependencyGraph(false)}
          />
        </Show>
      </div>
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200 text-sm"
      />
    </div>
  );
}
