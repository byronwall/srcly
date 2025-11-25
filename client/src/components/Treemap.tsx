import { createEffect, onCleanup, onMount } from "solid-js";
import * as d3 from "d3";
import { extractFilePath } from "../utils/dataProcessing";

interface TreemapProps {
  data: any;
  onFileSelect?: (path: string) => void;
}

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;

  const colorScale = d3
    .scaleLinear<string>()
    .domain([0, 10, 50])
    .range(["#569cd6", "#dcdcaa", "#ce9178"])
    .clamp(true);

  function handleHierarchyClick(d: d3.HierarchyNode<any>) {
    if (!props.onFileSelect) return;
    const nodeType = d.data?.type as string | undefined;
    const filePath = extractFilePath(
      d.data?.path as string | undefined,
      nodeType
    );
    if (!filePath) return;
    props.onFileSelect(filePath);
  }

  function renderTreemap(root: d3.HierarchyNode<any>) {
    if (!containerRef) return;

    const w = containerRef.clientWidth;
    const h = containerRef.clientHeight;

    if (w === 0 || h === 0) {
      return;
    }

    // Clear previous
    d3.select(containerRef).html("");

    d3
      .treemap()
      .size([w, h])
      .paddingInner(0)
      .paddingOuter(0)
      .round(false)
      .tile(d3.treemapBinary)(
      // Binary Tiling
      root
    );

    const svg = d3
      .select(containerRef)
      .append("svg")
      .attr("width", w)
      .attr("height", h)
      .style("shape-rendering", "crispEdges");

    // Cast to Rectangular node to access x0, y0, etc.
    const rootRect = root as d3.HierarchyRectangularNode<any>;
    const allNodes = rootRect.descendants();

    const folderNodes = allNodes.filter(
      (d) => d.depth > 0 && d.children && d.data.type === "folder"
    );
    const fileNodes = allNodes.filter(
      (d) => d.depth > 0 && d.data.type === "file"
    );
    const leafNodes = allNodes.filter((d) => !d.children);

    // 1. Draw Folder Backgrounds (outer-most grouping)
    svg
      .selectAll("rect.folder")
      .data(folderNodes)
      .join("rect")
      .attr("class", "folder")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("fill", "#1e1e1e")
      .attr("stroke", "#2d2d2d")
      .attr("stroke-width", 0.5);

    // 2. Draw File Boxes nested within folders
    svg
      .selectAll("rect.file")
      .data(fileNodes)
      .join("rect")
      .attr("class", "file")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      // Slightly lighter than folders so the hierarchy is visible
      .attr("fill", "#202020")
      .attr("stroke", "#3a3a3a")
      .attr("stroke-width", 0.75)
      .on("click", (_, d) => handleHierarchyClick(d));

    // 3. Draw Code-Chunks / Functions as leaves inside files
    svg
      .selectAll("rect.leaf")
      .data(leafNodes)
      .join("rect")
      .attr("class", "leaf")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("fill", (d) =>
        d.data.name === "(misc/imports)"
          ? "#444"
          : colorScale(d.data.metrics?.complexity || 0)
      )
      .attr("stroke", (d) => (d.x1 - d.x0 > 10 ? "#121212" : "none"))
      .attr("stroke-width", 0.5)
      .on("mouseover", (e, d) => showTooltip(e, d))
      .on("mouseout", hideTooltip)
      .on("click", (_, d) => handleHierarchyClick(d));

    // Text labels
    svg
      .selectAll("text.label")
      .data(leafNodes.filter((d) => d.x1 - d.x0 > 40 && d.y1 - d.y0 > 15))
      .join("text")
      .attr("class", "label")
      .attr("x", (d) => d.x0 + 5)
      .attr("y", (d) => d.y0 + 15)
      .text((d) => d.data.name)
      .attr("font-size", "10px")
      .attr("fill", "rgba(255,255,255,0.9)")
      .style("pointer-events", "none");
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
    if (props.data) {
      // Data is already filtered by App.tsx
      // We clone it just to be safe for D3 hierarchy which might attach properties
      const dataForD3 = JSON.parse(JSON.stringify(props.data));

      const root = d3
        .hierarchy(dataForD3)
        .sum((d) => (d.metrics ? d.metrics.loc : 0))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      renderTreemap(root);
    }
  });

  // Handle resize
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (props.data && containerRef) {
        const dataForD3 = JSON.parse(JSON.stringify(props.data));
        const root = d3
          .hierarchy(dataForD3)
          .sum((d) => (d.metrics ? d.metrics.loc : 0))
          .sort((a, b) => (b.value || 0) - (a.value || 0));
        renderTreemap(root);
      }
    });
    if (containerRef) resizeObserver.observe(containerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

  return (
    <div class="flex w-full h-full overflow-hidden border border-gray-700 rounded bg-[#121212]">
      <div ref={containerRef} class="flex-1 relative overflow-hidden" />
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200"
      />
    </div>
  );
}
