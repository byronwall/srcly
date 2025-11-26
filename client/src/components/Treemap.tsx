import {
  createEffect,
  onCleanup,
  onMount,
  createSignal,
  Show,
  For,
} from "solid-js";
import * as d3 from "d3";
import { extractFilePath, filterByExtension } from "../utils/dataProcessing";

interface TreemapProps {
  data: any;
  currentRoot?: any;
  onZoom?: (node: any) => void;
  onFileSelect?: (path: string) => void;
}

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "css", "json", "py", "md"];

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;

  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [breadcrumbs, setBreadcrumbs] = createSignal<any[]>([]);
  const [activeExtensions, setActiveExtensions] = createSignal<string[]>([]);
  const [colorMode, setColorMode] = createSignal<
    "complexity" | "last_modified" | "file_type"
  >("complexity");
  const [showLegend, setShowLegend] = createSignal(false);

  // Color scales
  const complexityColor = d3
    .scaleLinear<string>()
    .domain([0, 10, 50])
    .range(["#569cd6", "#dcdcaa", "#ce9178"])
    .clamp(true);

  const timeColor = d3
    .scaleLinear<string>()
    .domain([Date.now() / 1000 - 30 * 24 * 3600, Date.now() / 1000]) // 30 days ago to now
    .range(["#555", "#4caf50"])
    .clamp(true);

  const fileTypeColors: Record<string, string> = {
    ts: "#3178c6",
    tsx: "#3178c6",
    js: "#f1e05a",
    jsx: "#f1e05a",
    css: "#563d7c",
    json: "#40d47e",
    py: "#3572A5",
    md: "#083fa1",
    html: "#e34c26",
  };

  const getFileTypeColor = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    return fileTypeColors[ext] || "#888";
  };

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

  function handleHierarchyClick(d: d3.HierarchyNode<any>) {
    if (!props.onFileSelect) return;

    // If it's a folder, zoom in (isolate)
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
      props.onFileSelect(filePath);
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

    const root = d3
      .hierarchy(filteredData)
      // Only count LOC on leaf nodes so container values are the sum of their leaves
      .sum((d: any) => {
        if (!d) return 0;
        if (d.children.length === 0) return d.metrics?.loc || 0;
        // file or folder with children  - will get value automatically from children
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
    const allNodes = rootRect.descendants();

    // Groups for folders
    const cell = svg
      .selectAll("g")
      .data(allNodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    // Draw rects
    cell
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d) => {
        if (d.data.type === "folder") return "#1e1e1e";
        if (d.data.name === "(misc/imports)") return "#444";

        const mode = colorMode();
        if (mode === "last_modified") {
          return timeColor(d.data.metrics?.last_modified || 0);
        } else if (mode === "file_type") {
          return getFileTypeColor(d.data.name);
        }
        return complexityColor(d.data.metrics?.complexity || 0);
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
      .style("cursor", (d) =>
        d.data.type === "folder" ? "zoom-in" : "pointer"
      )
      .on("click", (e, d) => {
        e.stopPropagation();
        handleHierarchyClick(d);
      })
      .on("mouseover", (e, d) => {
        // Show tooltip for files AND leaf nodes (anything not a folder)
        if (d.data.type !== "folder") showTooltip(e, d);
      })
      .on("mouseout", hideTooltip);

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
      .attr("fill", "rgba(255,255,255,0.9)")
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
      .attr("font-size", "9px")
      .attr("fill", "rgba(255,255,255,0.7)")
      .style("pointer-events", "none")
      .style("overflow", "hidden");

    // Zoom Icon for nodes with children (folders or files with nested functions)
    cell
      .filter((d) => !!d.children && d.x1 - d.x0 > 35 && d.y1 - d.y0 > 35)
      .append("g")
      .attr("transform", (d) => `translate(${d.x1 - d.x0 - 20}, 4)`)
      .style("cursor", "pointer")
      .on("click", (e, d) => {
        e.stopPropagation();
        zoomToNode(d.data);
      })
      .call((g) => {
        // Background
        g.append("rect")
          .attr("width", 16)
          .attr("height", 16)
          .attr("rx", 4)
          .attr("fill", "rgba(0, 0, 0, 0.5)")
          .attr("stroke", "rgba(255, 255, 255, 0.2)")
          .attr("stroke-width", 1);

        // Icon (Magnifying glass)
        g.append("path")
          .attr("d", "M6.5 3.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M8.5 8.5l2.5 2.5")
          .attr("stroke", "white")
          .attr("stroke-width", 1.5)
          .attr("fill", "none")
          .attr("transform", "translate(2, 2)");
      })
      .append("title")
      .text("Zoom In");
  }

  function showTooltip(e: MouseEvent, d: d3.HierarchyNode<any>) {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "1";
    tooltipRef.style.left = e.pageX + 10 + "px";
    tooltipRef.style.top = e.pageY + 10 + "px";
    tooltipRef.innerHTML = `<strong>${d.data.name}</strong><br>LOC: ${
      d.value
    }<br>Complexity: ${d.data.metrics?.complexity || 0}`;
  }

  function hideTooltip() {
    if (!tooltipRef) return;
    tooltipRef.style.opacity = "0";
  }

  createEffect(() => {
    if (currentRoot()) {
      renderTreemap(currentRoot());
    }
  });

  // Handle resize
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (currentRoot()) {
        renderTreemap(currentRoot());
      }
    });
    if (containerRef) resizeObserver.observe(containerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

  return (
    <div class="flex flex-col w-full h-full overflow-hidden border border-gray-700 rounded bg-[#121212]">
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

        {/* Color Mode */}
        <div class="flex items-center gap-1 ml-4 relative">
          <span
            class="text-xs text-gray-500 mr-2 uppercase tracking-wider cursor-help hover:text-gray-300 border-b border-dotted border-gray-600"
            onMouseEnter={() => setShowLegend(true)}
            onMouseLeave={() => setShowLegend(false)}
          >
            Color:
          </span>
          <select
            class="bg-[#252526] border border-[#3e3e42] text-gray-400 text-xs rounded px-1 py-0.5 outline-none"
            value={colorMode()}
            onChange={(e) => setColorMode(e.currentTarget.value as any)}
          >
            <option value="complexity">Complexity</option>
            <option value="last_modified">Last Edited</option>
            <option value="file_type">File Type</option>
          </select>
        </div>

        {/* Legend Tooltip */}
        <Show when={showLegend()}>
          <div class="absolute top-10 right-4 z-50 bg-[#252526] border border-[#3e3e42] p-3 rounded shadow-xl text-xs w-64">
            <div class="font-bold mb-2 text-gray-300 border-b border-[#3e3e42] pb-1">
              {colorMode() === "complexity" && "Cyclomatic Complexity"}
              {colorMode() === "last_modified" && "Last Modified"}
              {colorMode() === "file_type" && "File Types"}
            </div>

            <Show when={colorMode() === "complexity"}>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#569cd6]"></div>{" "}
                  <span>Low (0-10)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#dcdcaa]"></div>{" "}
                  <span>Medium (10-50)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#ce9178]"></div>{" "}
                  <span>High (&gt;50)</span>
                </div>
              </div>
            </Show>

            <Show when={colorMode() === "last_modified"}>
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#4caf50]"></div>{" "}
                  <span>Recent (&lt; 1 day)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#555]"></div>{" "}
                  <span>Old (&gt; 30 days)</span>
                </div>
                <div class="text-[10px] text-gray-500 mt-1">
                  Gradient from green to grey
                </div>
              </div>
            </Show>

            <Show when={colorMode() === "file_type"}>
              <div class="grid grid-cols-2 gap-1">
                <For each={Object.entries(fileTypeColors)}>
                  {([ext, color]) => (
                    <div class="flex items-center gap-2">
                      <div
                        class="w-3 h-3"
                        style={{ "background-color": color }}
                      ></div>
                      <span>.{ext}</span>
                    </div>
                  )}
                </For>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 bg-[#888]"></div>
                  <span>other</span>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <div ref={containerRef} class="flex-1 relative overflow-hidden" />
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200 text-sm"
      />
    </div>
  );
}
