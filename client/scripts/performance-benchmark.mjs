import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { filterTree as filterCurrent, filterData } from "../src/utils/dataProcessing.ts";
import { addScopeBodyDummyNodes as addBodiesCurrent } from "../src/viz/treemap/utils/tree.ts";
import { flattenExplorerTree, getVirtualTreeRange } from "../src/utils/explorerTree.ts";

const require = createRequire(new URL("../package.json", import.meta.url));
const d3 = await import(require.resolve("d3"));

function makeTree(targetNodes) {
  const root = { name: "repo", path: "/repo", type: "folder", metrics: { loc: 0 }, children: [] };
  const folderCount = 100;
  const filesPerFolder = Math.max(1, Math.floor((targetNodes - 1) / (folderCount * 6)));
  let nodes = 1;
  for (let f = 0; f < folderCount; f++) {
    const folder = { name: `src-${f}`, path: `/repo/src-${f}`, type: "folder", metrics: { loc: 0 }, children: [] };
    root.children.push(folder);
    nodes++;
    for (let i = 0; i < filesPerFolder; i++) {
      const path = `${folder.path}/File${i}.tsx`;
      const functions = Array.from({ length: 5 }, (_, j) => ({
        name: `function${j}`,
        path: `${path}::function${j}`,
        type: "function",
        start_line: j * 20 + 1,
        end_line: j * 20 + 18,
        metrics: { loc: 18, complexity: j + 1 },
        children: [],
      }));
      folder.children.push({ name: `File${i}.tsx`, path, type: "file", metrics: { loc: 120, complexity: 12 }, children: functions });
      nodes += 6;
      folder.metrics.loc += 120;
      if (i % 5 === 0) {
        folder.children.push({ name: `ignored${i}.py`, path: `${folder.path}/ignored${i}.py`, type: "file", metrics: { loc: 80, complexity: 4 }, children: [] });
        nodes++;
      }
    }
    root.metrics.loc += folder.metrics.loc;
  }
  return { root, nodes, folderCount, filesPerFolder };
}

function count(root) {
  let total = 0;
  const stack = root ? [root] : [];
  while (stack.length) {
    const node = stack.pop();
    total++;
    stack.push(...(node.children ?? []));
  }
  return total;
}

function cloneFilterOriginal(data, excludedPaths, query) {
  const clone = JSON.parse(JSON.stringify(data));
  const excluded = new Set(excludedPaths);
  const removeExcluded = (node) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => !excluded.has(child.path));
    node.children.forEach(removeExcluded);
  };
  removeExcluded(clone);
  const lowerQuery = query.toLowerCase();
  const matches = (node) => node.name.toLowerCase().includes(lowerQuery);
  function recurse(node) {
    if (!node.children || node.children.length === 0) return matches(node) ? node : null;
    const children = node.children.map(recurse).filter((child) => child !== null);
    if (matches(node) || children.length > 0) return { ...node, children };
    return null;
  }
  return recurse(clone);
}

// This mirrors the pre-optimization helper in f9605b3. It cloned every node
// and child array before adding any synthetic body leaves.
function addBodiesOriginal(node) {
  if (!node) return node;
  const clone = { ...node, children: Array.isArray(node.children) ? [...node.children] : [] };
  const hasChildren = clone.children.length > 0;
  if (clone.type === "function" && hasChildren) {
    const hasBody = clone.children.some((child) => child?.type === "function_body" || child?.name === "(body)");
    const loc = clone.metrics?.loc || 0;
    if (!hasBody && loc > 0) clone.children.push({
      name: "(body)", path: `${clone.path || clone.name || ""}::(body)`, type: "function_body",
      metrics: { ...(clone.metrics || {}), loc }, start_line: clone.start_line, end_line: clone.end_line, children: [],
    });
  }
  if (clone.type === "file" && hasChildren) {
    const hasBody = clone.children.some((child) => child?.name === "(body)");
    const functionLoc = clone.children.reduce((total, child) => total + (child?.type === "function" ? child?.metrics?.loc || 0 : 0), 0);
    const remainder = Math.max(0, (clone.metrics?.loc || 0) - functionLoc);
    if (!hasBody && remainder > 0) clone.children.push({
      name: "(body)", path: `${clone.path || clone.name || ""}::(body)`, type: "file_body",
      metrics: { ...(clone.metrics || {}), loc: remainder }, children: [],
    });
  }
  if (clone.children.length) clone.children = clone.children.map(addBodiesOriginal);
  return clone;
}

function hierarchyLayout(data) {
  const root = d3.hierarchy(data).sum((node) => {
    if (!node?.metrics) return 0;
    return Array.isArray(node.children) && node.children.length ? 0 : node.metrics.loc || 0;
  }).sort((a, b) => {
    const aBody = a.data?.type === "function_body" || a.data?.name === "(body)";
    const bBody = b.data?.type === "function_body" || b.data?.name === "(body)";
    if (aBody && !bBody) return 1;
    if (!aBody && bBody) return -1;
    return (b.value || 0) - (a.value || 0);
  });
  d3.treemap().size([1440, 900]).paddingOuter(4).paddingTop(20).paddingInner(2).round(true).tile(d3.treemapBinary)(root);
  return root;
}

function treemapOriginal(data, excludedPaths) {
  const clone = JSON.parse(JSON.stringify(data));
  const filtered = filterData(clone, { extensions: ["tsx"], maxLoc: 1000, excludedPaths });
  return addBodiesOriginal(filtered);
}

function treemapCurrent(data, excludedPaths) {
  const filtered = filterData(data, { extensions: ["tsx"], maxLoc: 1000, excludedPaths });
  return addBodiesCurrent(filtered);
}

function time(fn) {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const output = { generatedAt: new Date().toISOString(), nodeVersion: process.version, results: [] };
for (const requestedNodes of [20000, 50000]) {
  const { root, nodes, folderCount, filesPerFolder } = makeTree(requestedNodes);
  const query = "File0.tsx";
  const excluded = ["/repo/src-3/File3.tsx"];
  const oldTimes = [];
  const newTimes = [];
  let oldResult;
  let newResult;
  for (let i = 0; i < 8; i++) {
    const oldSample = time(() => cloneFilterOriginal(root, excluded, query));
    const newSample = time(() => filterCurrent(root, query, excluded));
    oldResult = oldSample.result;
    newResult = newSample.result;
    if (i >= 3) {
      oldTimes.push(oldSample.ms);
      newTimes.push(newSample.ms);
    }
  }

  const allExpanded = () => true;
  const explorerStart = performance.now();
  const rows = flattenExplorerTree(root, {
    isExpanded: allExpanded,
    getValue: (node) => node.name,
    direction: "asc",
  });
  const explorerPrepMs = performance.now() - explorerStart;
  const virtualRows = getVirtualTreeRange(100000, 640, rows.length);
  const treemapOld = [];
  const treemapNew = [];
  let layoutNodeCount = 0;
  const excludedForTreemap = ["/repo/src-3/File3.tsx"];
  for (let i = 0; i < 8; i++) {
    const oldSample = time(() => hierarchyLayout(treemapOriginal(root, excludedForTreemap)));
    const newSample = time(() => hierarchyLayout(treemapCurrent(root, excludedForTreemap)));
    layoutNodeCount = oldSample.result.descendants().length;
    if (i >= 3) {
      treemapOld.push(oldSample.ms);
      treemapNew.push(newSample.ms);
    }
  }
  output.results.push({
    requestedNodes,
    inputNodes: nodes,
    folderCount,
    filesPerFolder,
    query,
    excludedPathCount: excluded.length,
    originalCloneFilterMedianMs: median(oldTimes),
    immutableCombinedFilterMedianMs: median(newTimes),
    originalResultNodes: count(oldResult),
    currentResultNodes: count(newResult),
    allExpandedExplorerFlattenMs: explorerPrepMs,
    allExpandedExplorerRows: rows.length,
    virtualRowsAtScroll100000Viewport640: Math.max(0, virtualRows.end - virtualRows.start),
    originalTreemapCloneFilterBodyAndLayoutMedianMs: median(treemapOld),
    currentTreemapFilterSelectiveBodyAndLayoutMedianMs: median(treemapNew),
    treemapHierarchyNodes: layoutNodeCount,
    virtualWindowTopSpacerPx: virtualRows.top,
    virtualWindowBottomSpacerPx: virtualRows.bottom,
    warmupRuns: 3,
    measuredRuns: 5,
    note: "Node compute timings only. Flatten timing excludes Solid render, DOM, layout, paint, and input latency.",
  });
}

const resultPath = new URL("../../tmp/client-performance-candidate.json", import.meta.url);
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
await writeFile(resultPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
