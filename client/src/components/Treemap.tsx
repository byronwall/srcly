import { createEffect, onCleanup, onMount } from "solid-js";
import * as d3 from "d3";

interface TreemapProps {
  data: any;
}

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  let tooltipRef: HTMLDivElement | undefined;
  let sidebarRef: HTMLDivElement | undefined;

  const colorScale = d3
    .scaleLinear<string>()
    .domain([0, 10, 50])
    .range(["#569cd6", "#dcdcaa", "#ce9178"])
    .clamp(true);

  // Ported from code-viz.html, but adapted to our JSON:
  // The backend always sends `children: []` for leaf nodes (functions and code_fragments),
  // whereas the original prototype used `children === undefined` for leaves.
  // We must treat both `undefined` and `[]` as "no children" so we do NOT
  // try to re-aggregate metrics for leaves, otherwise LOC gets zeroed out.
  function filterNoise(node: any) {
    if (!node.children || node.children.length === 0) return node;

    // Aggressively remove very small functions/code fragments that cause visual noise
    node.children = node.children.filter((child: any) => {
      const isNoiseFile = ["lock", "png", "svg"].some((x) =>
        child.name.includes(x)
      );
      const isTinyFunction =
        child.type !== "folder" && (child.metrics?.loc || 0) < 5;
      return !isNoiseFile && !isTinyFunction;
    });

    // Recurse on filtered children
    node.children.forEach(filterNoise);

    // Recalculate metrics for parents after filtering
    if (node.metrics) {
      node.metrics.loc = node.children.reduce(
        (acc: number, c: any) => acc + (c.metrics?.loc || 0),
        node.type === "file" && node.children.length === 0
          ? node.metrics.loc || 0
          : 0
      );
    }

    return node;
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

    // Separate nodes by semantic type so that the visual hierarchy is clear:
    // - folders: container backgrounds for whole subtrees
    // - files: boxes inside folders
    // - code chunks (functions / misc): leaves inside files
    const folderNodes = allNodes.filter(
      (d) => d.depth > 0 && d.children && d.data.type === "folder"
    );
    const fileNodes = allNodes.filter(
      (d) => d.depth > 0 && d.data.type === "file"
    );
    const leafNodes = allNodes.filter((d) => !d.children);

    // Debug: prove that our hierarchy and layout line up with the data model
    // This mirrors the "MRI Debug Logs" from the original HTML prototype.
    console.groupCollapsed("🧭 Treemap layout (client)");
    console.log("Total hierarchy nodes:", allNodes.length);
    console.log(
      "Folders:",
      folderNodes.length,
      "Files:",
      fileNodes.length,
      "Leaves (functions/fragments):",
      leafNodes.length
    );
    console.log("Root node:", {
      name: rootRect.data?.name,
      type: rootRect.data?.type,
      loc: rootRect.value,
    });
    const sampleFolder = folderNodes[0];
    if (sampleFolder) {
      console.log("Sample folder node", {
        name: sampleFolder.data.name,
        type: sampleFolder.data.type,
        loc: sampleFolder.value,
        depth: sampleFolder.depth,
        layout: {
          x0: sampleFolder.x0,
          y0: sampleFolder.y0,
          x1: sampleFolder.x1,
          y1: sampleFolder.y1,
        },
      });
      const childrenSummary = sampleFolder.children?.map((c) => ({
        name: c.data.name,
        type: c.data.type,
        loc: c.value,
        depth: c.depth,
      }));
      console.log("  └─ children of sample folder:", childrenSummary);
    }
    const sampleFile = fileNodes[0];
    if (sampleFile) {
      const fileLeaves = leafNodes.filter((l) => l.parent === sampleFile);
      console.log("Sample file node", {
        name: sampleFile.data.name,
        type: sampleFile.data.type,
        loc: sampleFile.value,
        depth: sampleFile.depth,
        layout: {
          x0: sampleFile.x0,
          y0: sampleFile.y0,
          x1: sampleFile.x1,
          y1: sampleFile.y1,
        },
        leafCountInFile: fileLeaves.length,
      });

      // Verify geometric containment: file is inside its folder, and leaves are inside the file.
      const fileFolderAncestor =
        sampleFile.ancestors().find((a) => a.data.type === "folder") ??
        undefined;
      if (fileFolderAncestor) {
        const folderBox = {
          x0: fileFolderAncestor.x0,
          y0: fileFolderAncestor.y0,
          x1: fileFolderAncestor.x1,
          y1: fileFolderAncestor.y1,
        };
        const fileBox = {
          x0: sampleFile.x0,
          y0: sampleFile.y0,
          x1: sampleFile.x1,
          y1: sampleFile.y1,
        };
        const fileInsideFolder =
          fileBox.x0 >= folderBox.x0 &&
          fileBox.y0 >= folderBox.y0 &&
          fileBox.x1 <= folderBox.x1 &&
          fileBox.y1 <= folderBox.y1;
        console.log("Geometric check (file inside folder):", {
          folder: fileFolderAncestor.data.name,
          file: sampleFile.data.name,
          fileInsideFolder,
        });
      }

      const sampleLeaves = fileLeaves.slice(0, 5);
      if (sampleLeaves.length > 0) {
        const leafSummaries = sampleLeaves.map((leaf) => {
          const leafBox = {
            x0: leaf.x0,
            y0: leaf.y0,
            x1: leaf.x1,
            y1: leaf.y1,
          };
          const fileBox = {
            x0: sampleFile.x0,
            y0: sampleFile.y0,
            x1: sampleFile.x1,
            y1: sampleFile.y1,
          };
          const insideFile =
            leafBox.x0 >= fileBox.x0 &&
            leafBox.y0 >= fileBox.y0 &&
            leafBox.x1 <= fileBox.x1 &&
            leafBox.y1 <= fileBox.y1;
          return {
            name: leaf.data.name,
            type: leaf.data.type,
            loc: leaf.value,
            depth: leaf.depth,
            insideFile,
          };
        });
        console.log("Sample leaves inside sample file:", leafSummaries);
      }
    }
    console.groupEnd();

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
      .attr("stroke-width", 0.75);

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
      .on("mouseout", hideTooltip);

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

  function buildTree(node: any, depth: number): string {
    if (!node) return "";
    if (node.type !== "folder" && (node.metrics?.loc || 0) < 10) return "";

    let icon =
      node.type === "folder"
        ? "📁"
        : node.name === "(misc/imports)"
        ? "⚙️"
        : "📄";
    let color = colorScale(node.metrics?.complexity || 0);
    if (node.name === "(misc/imports)") color = "#444";

    let html = `<div class="tree-node hover:bg-gray-700 cursor-pointer flex items-center text-gray-400 hover:text-white px-2 py-0.5 text-xs whitespace-nowrap overflow-hidden" style="padding-left:${
      depth * 12
    }px">
        <span style="opacity:0.7;margin-right:5px">${icon}</span>
        <span style="flex:1">${node.name}</span>
        <span style="font-family:monospace;font-size:10px;opacity:0.5">${
          node.metrics?.loc || 0
        }</span>
        <span class="w-2 h-2 rounded-full ml-auto" style="background:${color}"></span>
    </div>`;

    if (node.children) {
      node.children.forEach((c: any) => (html += buildTree(c, depth + 1)));
    }
    return html;
  }

  function renderSidebar(root: d3.HierarchyNode<any>) {
    if (!sidebarRef) return;
    const html = buildTree(root.data, 0);
    sidebarRef.innerHTML = html;
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
      // Clone data to avoid mutating prop if necessary, but filterNoise mutates in place
      // Let's assume fresh data or we can clone. JSON parse/stringify is cheap for this size usually
      const rawData = JSON.parse(JSON.stringify(props.data));

      const filteredData = filterNoise(rawData);

      const root = d3
        .hierarchy(filteredData)
        .sum((d) => (d.metrics ? d.metrics.loc : 0))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      renderTreemap(root);
      renderSidebar(root);
    }
  });

  // Handle resize
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (props.data && containerRef) {
        // Re-render on resize
        // We need to re-run the d3 logic.
        // For now, we can just trigger the effect again or extract the render logic.
        // Since the effect depends on props.data, we might need to store the root.
        // But simplest is just to re-process.
        const rawData = JSON.parse(JSON.stringify(props.data));
        const filteredData = filterNoise(rawData);
        const root = d3
          .hierarchy(filteredData)
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
      <div class="w-[350px] bg-[#1e1e1e] border-l border-[#333] flex flex-col">
        <div class="p-2 border-b border-[#333] font-bold bg-[#252526] text-gray-300">
          Explorer
        </div>
        <div ref={sidebarRef} class="flex-1 overflow-y-auto" />
      </div>
      <div
        ref={tooltipRef}
        class="fixed pointer-events-none opacity-0 bg-[#1e1e1e] p-2 border border-[#555] text-white z-50 shadow-lg transition-opacity duration-200"
      />
    </div>
  );
}
