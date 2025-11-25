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
  onFileSelect?: (path: string) => void;
}

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "css", "json", "py", "md"];

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;

  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [breadcrumbs, setBreadcrumbs] = createSignal<any[]>([]);
  const [activeExtensions, setActiveExtensions] = createSignal<string[]>([]);

  const colorScale = d3
    .scaleLinear<string>()
    .domain([0, 10, 50])
    .range(["#569cd6", "#dcdcaa", "#ce9178"])
    .clamp(true);

  // Initialize current root when data loads or updates
  createEffect(() => {
    if (props.data) {
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

    // If it's a file, select it
    if (d.data.type === "file") {
      const nodeType = d.data?.type as string | undefined;
      const filePath = extractFilePath(
        d.data?.path as string | undefined,
        nodeType
      );
      if (!filePath) return;
      props.onFileSelect(filePath);
      return;
    }

    // If it's a folder, zoom in (isolate)
    if (d.data.type === "folder") {
      zoomToNode(d.data);
    }
  }

  function zoomToNode(nodeData: any) {
    setCurrentRoot(nodeData);

    // Reconstruct breadcrumbs path
    // Since we don't have parent pointers in the raw data easily, we might need to track it.
    // However, we can just append if we are going down.
    // But if we jump around it's harder.
    // Let's try to find the path from the original root to this node.
    // Actually, simpler: just append to breadcrumbs if it's a child.
    // But wait, if we click a folder deep down, we want the full path.

    // Alternative: We can just use the path string if available, or just append for now.
    // Let's try to find the path in the original tree.
    const path: any[] = [];

    function findPath(root: any, target: any, currentPath: any[]): boolean {
      if (root === target) {
        path.push(...currentPath, root);
        return true;
      }
      if (root.children) {
        for (const child of root.children) {
          if (findPath(child, target, [...currentPath, root])) return true;
        }
      }
      return false;
    }

    if (props.data) {
      findPath(props.data, nodeData, []);
      setBreadcrumbs(path);
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
        : JSON.parse(JSON.stringify(rootData));

    if (!filteredData) {
      d3.select(containerRef)
        .append("div")
        .attr("class", "flex items-center justify-center h-full text-gray-500")
        .text("No files match the selected filters");
      return;
    }

    const root = d3
      .hierarchy(filteredData)
      .sum((d) => (d.metrics ? d.metrics.loc : 0))
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
        return colorScale(d.data.metrics?.complexity || 0);
      })
      .attr("stroke", (d) => (d.data.type === "folder" ? "#333" : "#121212"))
      .attr("stroke-width", (d) => (d.data.type === "folder" ? 1 : 0.5))
      .style("cursor", (d) =>
        d.data.type === "folder" ? "zoom-in" : "pointer"
      )
      .on("click", (e, d) => {
        e.stopPropagation();
        handleHierarchyClick(d);
      })
      .on("mouseover", (e, d) => {
        if (d.data.type === "file") showTooltip(e, d);
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
      .attr("fill", "rgba(255,255,255,0.9)")
      .style("pointer-events", "none");

    // Isolate Button (small icon on hover? or just click folder to zoom?)
    // Click folder to zoom is implemented.
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
      </div>

      <div ref={containerRef} class="flex-1 relative overflow-hidden" />
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200 text-sm"
      />
    </div>
  );
}
