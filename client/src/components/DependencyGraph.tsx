import { createSignal, createEffect, Show, For } from "solid-js";
import CodeModal from "./CodeModal";
import ELK from "elkjs/lib/elk.bundled.js";
import * as d3 from "d3";
import { HOTSPOT_METRICS, type HotSpotMetricId } from "../utils/metricsStore";

interface DependencyGraphProps {
  path: string;
  onClose: () => void;
  primaryMetricId: HotSpotMetricId;
  fileMetricsByName?: Map<string, any>;
}

interface Node {
  id: string;
  label: string;
  type: "file" | "external" | "dummy" | "export";
  parent?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // High in-degree (“super”) node visualization
  assignmentCode?: string;
  assignmentColor?: string;
  isSuperNode?: boolean;
  // For dummy nodes, which super node they stand in for
  superNodeId?: string;
  children?: Node[];
}

interface Edge {
  id: string;
  source: string;
  target: string;
  sections?: {
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: { x: number; y: number }[];
  }[];
}

interface GraphData {
  nodes: any[];
  edges: any[];
}

interface SuperNodeAssignment {
  nodeId: string;
  label: string;
  code: string;
  color: string;
}

const MAX_INCOMING_LINKS = 5;

const ASSIGNMENT_COLORS = [
  "#ff6b6b",
  "#feca57",
  "#54a0ff",
  "#5f27cd",
  "#1dd1a1",
  "#ff9ff3",
  "#48dbfb",
  "#ffaf40",
  "#00d2d3",
  "#c8d6e5",
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function getFileBaseName(label: string): string {
  const lastSlash = label.lastIndexOf("/");
  return lastSlash >= 0 ? label.slice(lastSlash + 1) : label;
}

// Color scales: keep in sync with the treemap hotspot coloring.
const complexityColor = d3
  .scaleLinear<string>()
  .domain([0, 10, 50])
  .range(["#569cd6", "#dcdcaa", "#ce9178"])
  .clamp(true);

const commentDensityColor = d3
  .scaleLinear<string>()
  .domain([0, 0.2, 0.5])
  .range(["#ffcccc", "#ff9999", "#ff0000"])
  .clamp(true);

const nestingDepthColor = d3
  .scaleLinear<string>()
  .domain([0, 3, 8])
  .range(["#e0f7fa", "#4dd0e1", "#006064"])
  .clamp(true);

const todoCountColor = d3
  .scaleLinear<string>()
  .domain([0, 1, 5])
  .range(["#f1f8e9", "#aed581", "#33691e"])
  .clamp(true);

const getContrastingTextColor = (bgColor: string, alpha = 1) => {
  const base = d3.hsl(bgColor);
  const lightBackground = base.l >= 0.5;
  const targetLightness = lightBackground ? 0.12 : 0.9;
  const textColor = d3.hsl(base.h, base.s * 0.9, targetLightness).rgb();
  return `rgba(${Math.round(textColor.r)}, ${Math.round(
    textColor.g
  )}, ${Math.round(textColor.b)}, ${alpha})`;
};

/**
 * Derive a stable, human-meaningful two-letter code from a file label.
 *
 * Rules (in priority order):
 * - If the (normalized) file name is exactly two letters, use those.
 * - If the file name has dashes/other splits, use the first letter of the
 *   first two segments (e.g. "user-profile.tsx" -> "UP").
 * - Otherwise, make a best guess based on the characters in the name.
 * - Never reuse a two-letter code: if a candidate is already taken, walk
 *   through additional candidates and finally fall back to any unused
 *   AA..ZZ combination.
 */
function normalizeBaseName(label: string): string {
  const lastSlash = label.lastIndexOf("/");
  const filePart = lastSlash >= 0 ? label.slice(lastSlash + 1) : label;

  const lastDot = filePart.lastIndexOf(".");
  const withoutExt = lastDot > 0 ? filePart.slice(0, lastDot) : filePart;

  return withoutExt.trim();
}

function buildCandidateCodes(label: string): string[] {
  const base = normalizeBaseName(label).replace(/[\[\]]/g, "");
  const letters = (base.toUpperCase().match(/[A-Z]/g) ?? []) as string[];
  const candidates: string[] = [];

  // 1. Exactly two letters: use those directly.
  if (letters.length === 2) {
    candidates.push(letters.join(""));
  }

  // 2. Dashes / other splits – take initials of first two meaningful segments.
  const parts = base.split(/[-_\s]+/).filter(Boolean);
  const partInitials = parts
    .map((p) => (p.match(/[A-Za-z]/)?.[0] ?? "").toUpperCase())
    .filter(Boolean);
  if (partInitials.length >= 2) {
    const code = `${partInitials[0]}${partInitials[1]}`;
    if (!candidates.includes(code)) candidates.push(code);
  }

  // 3. Best-guess fallbacks from the letter sequence itself.
  if (letters.length >= 2) {
    const firstTwo = `${letters[0]}${letters[1]}`;
    if (!candidates.includes(firstTwo)) candidates.push(firstTwo);

    const firstLast = `${letters[0]}${letters[letters.length - 1]}`;
    if (!candidates.includes(firstLast)) candidates.push(firstLast);
  } else if (letters.length === 1) {
    const doubled = `${letters[0]}${letters[0]}`;
    if (!candidates.includes(doubled)) candidates.push(doubled);
  }

  // 4. Additional combinations of letters to improve chances of uniqueness.
  for (let i = 0; i < letters.length && i < 4; i++) {
    for (let j = i + 1; j < letters.length && j < i + 4; j++) {
      const code = `${letters[i]}${letters[j]}`;
      if (!candidates.includes(code)) candidates.push(code);
    }
  }

  return candidates;
}

function generateAssignmentCodeFromLabel(
  label: string,
  usedCodes: Set<string>
): string {
  const candidates = buildCandidateCodes(label);

  for (const code of candidates) {
    if (code.length === 2 && !usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }

  // Final fallback: scan the full AA..ZZ space for the first unused code.
  for (let i = 0; i < LETTERS.length; i++) {
    for (let j = 0; j < LETTERS.length; j++) {
      const code = `${LETTERS[i]}${LETTERS[j]}`;
      if (!usedCodes.has(code)) {
        usedCodes.add(code);
        return code;
      }
    }
  }

  // Extremely unlikely: all codes used. Still return something deterministic.
  return "??";
}

export default function DependencyGraph(props: DependencyGraphProps) {
  const [nodes, setNodes] = createSignal<Node[]>([]);
  const [edges, setEdges] = createSignal<Edge[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [rawGraph, setRawGraph] = createSignal<GraphData | null>(null);
  const [showExternal, setShowExternal] = createSignal(false);
  const [showExportedMembers, setShowExportedMembers] = createSignal(false);
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);
  const [activeNodeId, setActiveNodeId] = createSignal<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(
    null
  );
  const [superNodeAssignments, setSuperNodeAssignments] = createSignal<
    SuperNodeAssignment[]
  >([]);
  const [hideUnimported, setHideUnimported] = createSignal(false);

  let svgRef: SVGSVGElement | undefined;
  let gRef: SVGGElement | undefined;
  let zoomBehavior: any;

  const elk = new ELK();
  const primaryMetric = () => props.primaryMetricId || "complexity";

  createEffect(() => {
    fetchGraph(props.path);
  });

  async function fetchGraph(path: string) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("http://localhost:8000/api/analysis/dependencies");
      if (path) url.searchParams.append("path", path);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch dependencies");

      const data = (await response.json()) as GraphData;
      setRawGraph(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function filterGraph(
    data: GraphData,
    includeExternal: boolean,
    showExports: boolean,
    hideUnimportedNodes: boolean
  ): GraphData {
    let filteredNodes = data.nodes;
    let filteredEdges = data.edges;

    // 1. Filter external nodes if needed
    if (!includeExternal) {
      filteredNodes = filteredNodes.filter((n) => n.type !== "external");
      const allowedIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (e) => allowedIds.has(e.source) && allowedIds.has(e.target)
      );
    }

    // 2. Handle exported members
    if (!showExports) {
      // If NOT showing exports, we should filter out export nodes
      // AND collapse edges to be file-to-file.

      // Filter out export nodes
      filteredNodes = filteredNodes.filter((n) => n.type !== "export");
      const allowedIds = new Set(filteredNodes.map((n) => n.id));

      // Remap edges: if source or target is an export node, map it to its parent file.
      // Note: The server sends edges like ExportNode -> ImportingFile.
      // If we hide exports, we want File(ExportParent) -> ImportingFile.
      // Or rather ImportingFile -> File(ExportParent) (standard dependency direction).

      // Wait, the server sends:
      // 1. File -> File (standard)
      // 2. Export -> File (if specific import found)

      // If we have both, we might get duplicates if we just remap.
      // But the server sends BOTH standard and specific edges?
      // Let's check analysis.py again.
      // Yes, it sends standard edges AND specific edges.

      // So if showExports is FALSE, we just use the standard edges (File -> File).
      // We filter out edges that involve export nodes.

      // But wait, the server sends edges where source/target are IDs.
      // Export nodes have IDs like "file_path::export_name".
      // File nodes have IDs like "file_path".

      // So we just need to filter out edges where source or target is NOT in allowedIds.
      filteredEdges = filteredEdges.filter(
        (e) => allowedIds.has(e.source) && allowedIds.has(e.target)
      );
    } else {
      // If SHOWING exports:
      //
      // The backend always emits two kinds of edges for internal TS/TSX deps:
      //   1) File  -> File        (importer -> exported file)
      //   2) Export -> File       (exported member -> importing file)
      //
      // When visualising exported members, we only want to show the
      // "imported by" direction (2). Keeping (1) as well causes a second,
      // opposite arrow between the same pair of files (what you're seeing
      // between `App.tsx` and `src/index.tsx`).
      //
      // However, for files that *don't* have any exported-member nodes we
      // still need their File -> File edges, otherwise they would disappear
      // entirely in this view.
      //
      // Strategy:
      //   - Compute the set of file IDs that own at least one `export` node.
      //   - Drop any edge where both ends are file nodes *and* the target
      //     file is in that set (its relationship will be expressed via
      //     Export -> File edges instead).

      const nodeById = new Map<string, any>(
        filteredNodes.map((n: any) => [n.id as string, n])
      );

      const filesWithExports = new Set<string>();
      for (const n of filteredNodes) {
        if (n.type === "export" && typeof n.parent === "string") {
          filesWithExports.add(n.parent);
        }
      }

      filteredEdges = filteredEdges.filter((e) => {
        const sourceNode = nodeById.get(e.source as string);
        const targetNode = nodeById.get(e.target as string);

        if (!sourceNode || !targetNode) return true;

        const sourceIsFile = sourceNode.type === "file";
        const targetIsFile = targetNode.type === "file";

        if (
          sourceIsFile &&
          targetIsFile &&
          filesWithExports.has(targetNode.id)
        ) {
          // Suppress redundant File -> File edge when we have export-level
          // edges for the target file; this removes the "reverse" arrows
          // while keeping higher-level edges for non-exporting files.
          return false;
        }

        return true;
      });
    }

    if (hideUnimportedNodes) {
      const nodeById = new Map<string, any>(
        filteredNodes.map((n: any) => [n.id as string, n])
      );

      const fileImported = new Set<string>();
      const exportUsed = new Set<string>();

      // Map exports back to their parent file so we can keep files that
      // only appear via export-level edges.
      const exportParentById = new Map<string, string>();
      for (const node of filteredNodes) {
        if (node.type === "export" && typeof node.parent === "string") {
          exportParentById.set(node.id as string, node.parent);
        }
      }

      for (const edge of filteredEdges) {
        const sourceNode = nodeById.get(edge.source as string);
        const targetNode = nodeById.get(edge.target as string);
        if (!sourceNode || !targetNode) continue;

        const sourceType = sourceNode.type;
        const targetType = targetNode.type;

        // Standard file -> file edges: importer (source) -> imported file (target).
        if (sourceType === "file" && targetType === "file") {
          fileImported.add(targetNode.id as string);
          continue;
        }

        // Export-level edges: export (source) -> importing file (target).
        if (sourceType === "export" && targetType === "file") {
          exportUsed.add(sourceNode.id as string);
          const parentFileId = exportParentById.get(sourceNode.id as string) as
            | string
            | undefined;
          if (parentFileId) {
            fileImported.add(parentFileId);
          }
        }
      }

      const rootFileId = props.path;

      filteredNodes = filteredNodes.filter((node: any) => {
        if (node.type === "file") {
          if (rootFileId && node.id === rootFileId) {
            // Always keep the root file so there is a visible starting point.
            return true;
          }
          return fileImported.has(node.id as string);
        }
        if (node.type === "export") {
          return exportUsed.has(node.id as string);
        }
        // Never hide external or dummy nodes here; they are controlled by
        // other toggles or the super-node transform.
        return true;
      });

      const allowedIds = new Set(filteredNodes.map((n: any) => n.id as string));
      filteredEdges = filteredEdges.filter(
        (e) =>
          allowedIds.has(e.source as string) &&
          allowedIds.has(e.target as string)
      );
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }

  function transformHighInDegreeNodes(data: GraphData): {
    graph: GraphData;
    assignments: SuperNodeAssignment[];
  } {
    if (!data.nodes || !data.edges) {
      return { graph: data, assignments: [] };
    }

    // Only apply super node logic to FILE nodes, not export nodes.
    // And only if we are NOT showing exports? Or maybe always?
    // If showing exports, the edges go from Export -> File.
    // So the "target" is the File (Importing).
    // Wait, standard dependency: A imports B. Edge A -> B.
    // My implementation: Export(B) -> A.
    // So A is the target.
    // So A has high IN-degree if it imports many things.
    // Usually "Super Node" logic is for high IN-degree (many things depend on IT).
    // Standard: B is imported by many. B has high in-degree.
    // My new edges: B's exports point to A.
    // So A (importer) has high in-degree.
    // This reverses the meaning of "super node" visualization if we are not careful.

    // If showExportedMembers is ON, the arrows flow Data -> Usage.
    // So "Central" nodes are the ones using many things (God objects).
    // In standard view (Usage -> Dep), "Central" nodes are the ones used by many (Utilities).

    // For now, let's DISABLE super node logic when showing exported members to avoid confusion.
    if (showExportedMembers()) {
      return { graph: data, assignments: [] };
    }

    const inDegree = new Map<string, number>();
    for (const edge of data.edges) {
      if (!edge || typeof edge.target !== "string") continue;
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const candidateIds = Array.from(inDegree.entries())
      .filter(([, count]) => count > MAX_INCOMING_LINKS)
      .map(([id]) => id);

    if (candidateIds.length === 0) {
      return { graph: data, assignments: [] };
    }

    const nodeById = new Map<string, any>(
      data.nodes.map((n: any) => [n.id as string, n])
    );

    // Stable ordering by label so assignments/codes are deterministic
    const sortedSuperIds = [...candidateIds].sort((a, b) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      const la = (na?.label ?? "").toString().toLowerCase();
      const lb = (nb?.label ?? "").toString().toLowerCase();
      return la.localeCompare(lb);
    });

    const assignments: SuperNodeAssignment[] = [];
    const assignmentById = new Map<string, SuperNodeAssignment>();
    const usedCodes = new Set<string>();

    sortedSuperIds.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) return;
      const label = (node.label ?? id) as string;
      const code = generateAssignmentCodeFromLabel(label, usedCodes);
      const color =
        ASSIGNMENT_COLORS[index % ASSIGNMENT_COLORS.length] ??
        ASSIGNMENT_COLORS[ASSIGNMENT_COLORS.length - 1];
      const assignment: SuperNodeAssignment = {
        nodeId: id,
        label,
        code,
        color,
      };
      assignments.push(assignment);
      assignmentById.set(id, assignment);
    });

    if (assignments.length === 0) {
      return { graph: data, assignments: [] };
    }

    const baseNodes = data.nodes.map((n: any) => {
      const assignment = assignmentById.get(n.id as string);
      if (!assignment) return n;
      return {
        ...n,
        assignmentCode: assignment.code,
        assignmentColor: assignment.color,
        isSuperNode: true,
      };
    });

    const newNodes: any[] = [...baseNodes];
    const newEdges: any[] = [];

    let dummyIndex = 0;
    for (const edge of data.edges) {
      const targetAssignment = assignmentById.get(edge.target as string);
      if (!targetAssignment) {
        newEdges.push(edge);
        continue;
      }

      const baseEdgeId =
        (edge.id as string | undefined) ??
        `${String(edge.source)}->${String(edge.target)}`;
      const dummyId = `__dummy__${baseEdgeId}__${dummyIndex++}`;

      newNodes.push({
        id: dummyId,
        label: targetAssignment.code,
        type: "dummy",
        assignmentCode: targetAssignment.code,
        assignmentColor: targetAssignment.color,
        superNodeId: targetAssignment.nodeId,
      });

      newEdges.push({
        ...edge,
        id: `${baseEdgeId}__to_dummy`,
        target: dummyId,
      });
    }

    return {
      graph: {
        nodes: newNodes,
        edges: newEdges,
      },
      assignments,
    };
  }

  function transformHighInDegreeNodesWithExports(
    data: GraphData,
    showExports: boolean
  ): {
    graph: GraphData;
    assignments: SuperNodeAssignment[];
  } {
    if (!showExports) {
      return transformHighInDegreeNodes(data);
    }

    if (!data.nodes || !data.edges) {
      return { graph: data, assignments: [] };
    }

    const nodeById = new Map<string, any>(
      data.nodes.map((n: any) => [n.id as string, n])
    );

    // Count, for each individual export node, how many distinct files
    // consume it. This is the “item” we’re interested in promoting to a
    // super node when fan-in is high.
    const exportToConsumers = new Map<string, Set<string>>();

    for (const edge of data.edges) {
      const sourceNode = nodeById.get(edge.source as string);
      const targetNode = nodeById.get(edge.target as string);
      if (!sourceNode || !targetNode) continue;

      if (sourceNode.type === "export" && targetNode.type === "file") {
        const exportId = sourceNode.id as string;
        let consumers = exportToConsumers.get(exportId);
        if (!consumers) {
          consumers = new Set<string>();
          exportToConsumers.set(exportId, consumers);
        }
        consumers.add(targetNode.id as string);
      }
    }

    const candidateExportIds = Array.from(exportToConsumers.entries())
      .filter(([, consumers]) => consumers.size > MAX_INCOMING_LINKS)
      .map(([exportId]) => exportId);

    if (candidateExportIds.length === 0) {
      return { graph: data, assignments: [] };
    }

    // Stable ordering by export label so assignments/codes are deterministic.
    const sortedSuperExportIds = [...candidateExportIds].sort((a, b) => {
      const nodeA = nodeById.get(a);
      const nodeB = nodeById.get(b);
      const la = (nodeA?.label ?? "").toString().toLowerCase();
      const lb = (nodeB?.label ?? "").toString().toLowerCase();
      return la.localeCompare(lb);
    });

    const assignments: SuperNodeAssignment[] = [];
    const assignmentByExportId = new Map<string, SuperNodeAssignment>();
    const usedCodes = new Set<string>();

    sortedSuperExportIds.forEach((exportId, index) => {
      const node = nodeById.get(exportId);
      if (!node) return;

      const rawExportLabel = (node.label ?? exportId) as string;
      const parentFileId = (node.parent as string | undefined) ?? "";
      const parentFileNode = parentFileId
        ? (nodeById.get(parentFileId) as Node | undefined)
        : undefined;
      const parentFileLabelSource =
        (parentFileNode?.label as string | undefined) ?? parentFileId;
      const parentBaseName = parentFileLabelSource
        ? normalizeBaseName(parentFileLabelSource)
        : "";

      let legendLabel = rawExportLabel;
      let codeSourceLabel = rawExportLabel;

      // Special case: default exports.
      // - Legend label: "<FileName>/default" (no extension)
      // - Code: derived from the file name instead of the word "default".
      if (rawExportLabel.trim() === "default" && parentBaseName) {
        legendLabel = `${parentBaseName}/default`;
        codeSourceLabel = parentBaseName;
      } else if (parentBaseName) {
        // Non-default exports: append file name in legend for extra context.
        legendLabel = `${rawExportLabel} (${parentBaseName})`;
      }

      const code = generateAssignmentCodeFromLabel(codeSourceLabel, usedCodes);
      const color =
        ASSIGNMENT_COLORS[index % ASSIGNMENT_COLORS.length] ??
        ASSIGNMENT_COLORS[ASSIGNMENT_COLORS.length - 1];
      const assignment: SuperNodeAssignment = {
        nodeId: exportId,
        label: legendLabel,
        code,
        color,
      };
      assignments.push(assignment);
      assignmentByExportId.set(exportId, assignment);
    });

    const baseNodes = data.nodes.map((n: any) => {
      const assignment = assignmentByExportId.get(n.id as string);
      if (!assignment) return n;
      return {
        ...n,
        assignmentCode: assignment.code,
        assignmentColor: assignment.color,
        isSuperNode: true,
      };
    });

    const newNodes: any[] = [...baseNodes];
    const newEdges: any[] = [];
    const dummyByConsumerAndSuper = new Map<string, string>();
    let dummyIndex = 0;

    for (const edge of data.edges) {
      const sourceNode = nodeById.get(edge.source as string);
      const targetNode = nodeById.get(edge.target as string);

      if (
        sourceNode?.type === "export" &&
        targetNode?.type === "file" &&
        assignmentByExportId.has(sourceNode.id as string)
      ) {
        const consumerId = targetNode.id as string;
        const exportId = sourceNode.id as string;
        const key = `${consumerId}::${exportId}`;

        let dummyId = dummyByConsumerAndSuper.get(key);
        if (!dummyId) {
          const assignment = assignmentByExportId.get(exportId)!;
          dummyId = `__dummy_export__${exportId}__${consumerId}__${dummyIndex++}`;
          dummyByConsumerAndSuper.set(key, dummyId);

          newNodes.push({
            id: dummyId,
            label: assignment.code,
            type: "dummy",
            assignmentCode: assignment.code,
            assignmentColor: assignment.color,
            // Clicking the badge should still open the file where the
            // export is declared, so we keep the parent file id here.
            superNodeId: (sourceNode.parent as string | undefined) ?? undefined,
            parent: consumerId,
          });
        }

        continue;
      }

      newEdges.push(edge);
    }

    return {
      graph: {
        nodes: newNodes,
        edges: newEdges,
      },
      assignments,
    };
  }

  async function layoutGraph(data: GraphData) {
    // Construct ELK graph with hierarchy if needed

    // Group nodes by parent
    const nodesById = new Map<string, any>();
    const rootNodes: any[] = [];

    // First pass: create ELK node objects
    data.nodes.forEach((n) => {
      const isDummy = n.type === "dummy";
      const isExport = n.type === "export";

      let width = 0;
      let height = 0;

      if (isDummy) {
        width = 26;
        height = 26;
      } else if (isExport) {
        width = Math.max(60, String(n.label ?? "").length * 7);
        height = 24;
      } else {
        // File node
        width = Math.max(100, String(n.label ?? "").length * 8);
        height = 40;
      }

      nodesById.set(n.id, {
        id: n.id,
        width,
        height,
        labels: isDummy ? [] : [{ text: String(n.label ?? "") }],
        ...n,
        children: [], // Initialize children array
      });
    });

    // Second pass: build hierarchy
    nodesById.forEach((n) => {
      if (n.parent && nodesById.has(n.parent)) {
        const parent = nodesById.get(n.parent);
        parent.children.push(n);
      } else {
        rootNodes.push(n);
      }
    });

    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "40",
        "elk.spacing.edgeNode": "10",
        "elk.layered.spacing.edgeNodeBetweenLayers": "10",
        "elk.layered.layerUnzipping.minimizeEdgeLength": "true",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN", // Enable hierarchy
      },
      children: rootNodes,
      edges: data.edges.map((e) => ({
        id: e.id,
        sources: [e.source as string],
        targets: [e.target as string],
        label: (e as any).label,
      })),
    };

    try {
      const layout = await elk.layout(elkGraph as any);

      // Flatten the result back to a list of nodes for rendering
      const flatNodes: Node[] = [];

      function flatten(n: any, parentX = 0, parentY = 0) {
        const x = parentX + (n.x || 0);
        const y = parentY + (n.y || 0);

        flatNodes.push({
          ...n,
          x,
          y,
        });

        if (n.children) {
          n.children.forEach((c: any) => flatten(c, x, y));
        }
      }

      if (layout.children) {
        layout.children.forEach((c) => flatten(c));
      }

      // Reposition export nodes so they sit inside their parent file boxes,
      // below the file name, as pill-shaped labels, and position any
      // dummy badges along the top of the consumer files.
      const fileNodesById = new Map<string, Node>();
      const exportsByFile = new Map<string, Node[]>();
      const dummyBadgesByFile = new Map<string, Node[]>();

      for (const n of flatNodes) {
        if (n.type === "file") {
          fileNodesById.set(n.id, n);
        } else if (n.type === "export" && n.parent) {
          const arr = exportsByFile.get(n.parent) ?? [];
          arr.push(n);
          exportsByFile.set(n.parent, arr);
        } else if (n.type === "dummy" && n.parent) {
          const arr = dummyBadgesByFile.get(n.parent) ?? [];
          arr.push(n);
          dummyBadgesByFile.set(n.parent, arr);
        }
      }

      const H_PADDING = 16;
      const V_PADDING = 8;
      const H_GAP = 8;
      const PILL_HEIGHT = 24;

      exportsByFile.forEach((exports, fileId) => {
        const fileNode = fileNodesById.get(fileId);
        if (!fileNode) return;

        const fileX = fileNode.x ?? 0;
        const fileY = fileNode.y ?? 0;
        const fileWidth = fileNode.width ?? 120;
        const fileHeight = fileNode.height ?? 40;

        let currentX = fileX + H_PADDING;
        const baseY = fileY + fileHeight - PILL_HEIGHT - V_PADDING;

        for (const exp of exports) {
          const pillWidth = exp.width ?? 80;

          // Simple wrapping if we run out of horizontal space.
          if (currentX + pillWidth + H_PADDING > fileX + fileWidth) {
            currentX = fileX + H_PADDING;
          }

          exp.x = currentX;
          exp.y = baseY;

          currentX += pillWidth + H_GAP;
        }
      });

      const BADGE_RADIUS = 10;
      const BADGE_DIAMETER = BADGE_RADIUS * 2;
      const BADGE_GAP = 6;

      dummyBadgesByFile.forEach((badges, fileId) => {
        const fileNode = fileNodesById.get(fileId);
        if (!fileNode) return;

        const fileX = fileNode.x ?? 0;
        const fileY = fileNode.y ?? 0;
        const fileWidth = fileNode.width ?? 120;

        let currentX = fileX + H_PADDING;
        const centerY = fileY + V_PADDING + BADGE_RADIUS;

        for (const badge of badges) {
          if (currentX + BADGE_DIAMETER + H_PADDING > fileX + fileWidth) {
            currentX = fileX + H_PADDING;
          }

          badge.x = currentX;
          badge.y = centerY - BADGE_RADIUS;
          badge.width = BADGE_DIAMETER;
          badge.height = BADGE_DIAMETER;

          currentX += BADGE_DIAMETER + BADGE_GAP;
        }
      });

      setNodes(flatNodes);
      // Use ELK's routed edges (with bend points) so lines remain smooth; edges
      // are rendered after nodes so they appear on top of the file boxes.
      setEdges((layout.edges ?? []) as unknown as Edge[]);

      // Fit graph after layout update
      setTimeout(fitGraph, 0);
    } catch (err) {
      console.error("Layout error:", err);
      setError("Failed to layout graph");
    }
  }

  createEffect(() => {
    const data = rawGraph();
    if (!data) return;
    const includeExternal = showExternal();
    const showExports = showExportedMembers();
    const hideUnused = hideUnimported();

    const filtered = filterGraph(
      data,
      includeExternal,
      showExports,
      hideUnused
    );
    const { graph, assignments } = transformHighInDegreeNodesWithExports(
      filtered,
      showExports
    );
    setSuperNodeAssignments(assignments);
    void layoutGraph(graph);
  });

  // Track changes to the primary metric so node rendering stays reactive.
  createEffect(() => {
    primaryMetric();
  });

  function setupZoom() {
    if (!svgRef || !gRef) return;

    zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        d3.select(gRef).attr("transform", event.transform);
      });

    d3.select(svgRef).call(zoomBehavior);
  }

  function fitGraph() {
    if (!svgRef || !gRef || nodes().length === 0 || !zoomBehavior) return;

    const svg = d3.select(svgRef);
    const g = d3.select(gRef);

    // Get graph bounds
    const bounds = g.node()?.getBBox();
    if (!bounds) return;

    const parent = svg.node()?.parentElement;
    const width = parent?.clientWidth || 1000;
    const height = parent?.clientHeight || 800;
    const padding = 40;

    const scale = Math.min(
      (width - padding * 2) / bounds.width,
      (height - padding * 2) / bounds.height
    );

    // Limit initial scale
    const finalScale = Math.min(scale, 1);

    const x = (width - bounds.width * finalScale) / 2 - bounds.x * finalScale;
    const y = (height - bounds.height * finalScale) / 2 - bounds.y * finalScale;

    const transform = d3.zoomIdentity.translate(x, y).scale(finalScale);

    svg.transition().duration(750).call(zoomBehavior.transform, transform);
  }

  // Initialize zoom when SVG becomes available
  createEffect(() => {
    if (!loading() && !error() && svgRef) {
      setupZoom();
    }
  });

  function handleNodeClick(node: Node) {
    if (node.type === "dummy") {
      if (node.superNodeId) {
        setActiveNodeId(node.superNodeId);
        setTimeout(() => {
          setSelectedFilePath(node.superNodeId as string);
        }, 50);
      }
      return;
    }

    if (node.type !== "file") return;
    setActiveNodeId(node.id);
    // Slight delay so the active styling is visible before the modal appears
    setTimeout(() => {
      setSelectedFilePath(node.id);
    }, 50);
  }

  return (
    <div class="absolute inset-0 bg-[#1e1e1e] z-50 flex flex-col">
      <div class="flex items-center justify-between px-4 py-2 border-b border-[#333] bg-[#252526]">
        <h2 class="text-sm font-bold text-gray-300">
          Dependency Graph: {props.path || "Root"}
        </h2>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={showExternal()}
              onChange={(e) => setShowExternal(e.currentTarget.checked)}
            />
            <span>Show external deps</span>
          </label>
          <label class="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={showExportedMembers()}
              onChange={(e) => setShowExportedMembers(e.currentTarget.checked)}
            />
            <span>Show exports</span>
          </label>
          <label class="flex items-center gap-1 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={hideUnimported()}
              onChange={(e) => setHideUnimported(e.currentTarget.checked)}
            />
            <span>Hide unimported</span>
          </label>
          <div class="h-4 w-px bg-[#444]" />
          <button
            onClick={fitGraph}
            class="px-3 py-1 text-xs bg-[#3c3c3c] hover:bg-[#4c4c4c] text-gray-200 rounded border border-[#555] transition-colors"
          >
            Fit View
          </button>
          <button
            onClick={props.onClose}
            class="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-200 rounded border border-red-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div class="flex-1 relative overflow-hidden">
        <Show when={loading()}>
          <div class="absolute inset-0 flex items-center justify-center text-gray-400">
            Loading dependency graph...
          </div>
        </Show>

        <Show when={error()}>
          <div class="absolute inset-0 flex items-center justify-center text-red-400">
            Error: {error()}
          </div>
        </Show>

        <Show when={!loading() && !error()}>
          <svg
            ref={svgRef}
            class="w-full h-full cursor-grab active:cursor-grabbing"
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
                <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
              </marker>
            </defs>

            <g ref={gRef}>
              <For each={nodes()}>
                {(node) => {
                  const isActive = activeNodeId() === node.id;
                  const isHovered = hoveredNodeId() === node.id;
                  const nodeType = node.type;

                  // We render dummy, external, file and export nodes differently,
                  // but skip any unknown node types defensively.
                  if (
                    nodeType !== "file" &&
                    nodeType !== "external" &&
                    nodeType !== "dummy" &&
                    nodeType !== "export"
                  ) {
                    return null;
                  }
                  return (
                    <g
                      transform={`translate(${node.x}, ${node.y})`}
                      class="cursor-pointer"
                      onClick={() => handleNodeClick(node)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => {
                        if (hoveredNodeId() === node.id) {
                          setHoveredNodeId(null);
                        }
                      }}
                    >
                      {/* Recompute hotspot-driven visuals based on current metric */}
                      {(() => {
                        const isDummy = node.type === "dummy";
                        const isExternal = node.type === "external";
                        const isExport = node.type === "export";
                        const isEmphasized = isActive || isHovered;

                        let metrics: any | undefined;
                        if (
                          !isDummy &&
                          !isExternal &&
                          !isExport &&
                          props.fileMetricsByName
                        ) {
                          const baseName = getFileBaseName(
                            String(node.label ?? "")
                          );
                          metrics = props.fileMetricsByName.get(baseName);
                        }

                        const metricId = primaryMetric();
                        let hotspotColor: string | null = null;
                        if (metrics) {
                          let rawVal = (metrics as any)[metricId] ?? 0;
                          const def = HOTSPOT_METRICS.find(
                            (m) => m.id === metricId
                          );
                          if (def?.invert) {
                            rawVal = 1 - (rawVal || 0);
                          }
                          if (!isFinite(rawVal) || rawVal < 0) rawVal = 0;
                          const scaled =
                            typeof rawVal === "number"
                              ? Math.min(rawVal, 50)
                              : Number(rawVal) || 0;

                          if (metricId === "comment_density") {
                            hotspotColor = commentDensityColor(
                              metrics.comment_density || 0
                            );
                          } else if (metricId === "max_nesting_depth") {
                            hotspotColor = nestingDepthColor(
                              metrics.max_nesting_depth || 0
                            );
                          } else if (metricId === "todo_count") {
                            hotspotColor = todoCountColor(
                              metrics.todo_count || 0
                            );
                          } else {
                            hotspotColor = complexityColor(scaled);
                          }
                        }

                        const fill = isExternal
                          ? isEmphasized
                            ? "#383838"
                            : "#2d2d2d"
                          : isExport
                          ? isEmphasized
                            ? "#4a4a4a"
                            : "#333333"
                          : hotspotColor
                          ? hotspotColor
                          : isEmphasized
                          ? "#273955"
                          : "#1e1e1e";

                        const baseStroke = isExternal
                          ? isEmphasized
                            ? "#888"
                            : "#444"
                          : isExport
                          ? isEmphasized
                            ? "#aaa"
                            : "#666"
                          : isEmphasized
                          ? "#9cdcfe"
                          : "#569cd6";

                        const stroke =
                          node.isSuperNode && node.assignmentColor
                            ? node.assignmentColor
                            : baseStroke;

                        const textFill = isExternal
                          ? isEmphasized
                            ? "#bbbbbb"
                            : "#888"
                          : isExport
                          ? "#cccccc"
                          : hotspotColor
                          ? getContrastingTextColor(
                              hotspotColor,
                              isEmphasized ? 1 : 0.85
                            )
                          : isEmphasized
                          ? "#f3f3f3"
                          : "#d4d4d4";

                        if (isDummy) {
                          const radius =
                            Math.min(node.width ?? 20, node.height ?? 20) / 2 -
                            2;
                          const cx = (node.width ?? 20) / 2;
                          const cy = (node.height ?? 20) / 2;

                          return (
                            <>
                              <circle
                                cx={cx}
                                cy={cy}
                                r={radius}
                                fill={node.assignmentColor || "#888"}
                                stroke="#111"
                                stroke-width="1.5"
                              />
                              <text
                                x={cx}
                                y={cy}
                                dy="0.35em"
                                text-anchor="middle"
                                fill="#000"
                                font-size="10px"
                                class="pointer-events-none select-none font-mono"
                              >
                                {node.assignmentCode}
                              </text>
                            </>
                          );
                        }

                        const displayLabel = node.assignmentCode
                          ? `[${node.assignmentCode}] ${node.label}`
                          : node.label;

                        return (
                          <>
                            <rect
                              width={node.width}
                              height={node.height}
                              rx={isExport ? "10" : "4"}
                              fill={fill}
                              stroke={stroke}
                              stroke-width={isEmphasized ? "2" : "1"}
                            />
                            <text
                              x={(node.width || 0) / 2}
                              y={
                                isExport || isExternal
                                  ? (node.height || 0) / 2
                                  : 14
                              }
                              dy="0.35em"
                              text-anchor="middle"
                              fill={textFill}
                              font-size={isExport ? "10px" : "12px"}
                              class="pointer-events-none select-none"
                            >
                              {displayLabel}
                            </text>
                          </>
                        );
                      })()}
                    </g>
                  );
                }}
              </For>

              {/* Draw dependency edges last so they appear on top of file boxes while
                  preserving ELK's bend points for smooth routing. */}
              <For each={edges()}>
                {(edge) => {
                  if (!edge.sections || edge.sections.length === 0) return null;
                  const section = edge.sections[0];
                  let d = `M ${section.startPoint.x} ${section.startPoint.y}`;
                  if (section.bendPoints) {
                    section.bendPoints.forEach((p) => {
                      d += ` L ${p.x} ${p.y}`;
                    });
                  }
                  d += ` L ${section.endPoint.x} ${section.endPoint.y}`;

                  return (
                    <path
                      d={d}
                      stroke="#666"
                      stroke-width="1"
                      fill="none"
                      marker-end="url(#arrowhead)"
                    />
                  );
                }}
              </For>
            </g>
          </svg>
        </Show>
      </div>
      <Show when={superNodeAssignments().length > 0}>
        <div class="absolute bottom-4 left-4 bg-[#1e1e1e]/95 border border-[#333] rounded px-3 py-2 text-xs text-gray-200 shadow-lg max-w-sm">
          <div class="font-bold text-gray-300 text-[11px] mb-1 border-b border-[#333] pb-1">
            High In-Degree Targets
          </div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <For each={superNodeAssignments()}>
              {(item) => (
                <div class="flex items-center gap-2">
                  <div
                    class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-mono"
                    style={{
                      "background-color": item.color,
                      color: "#000",
                    }}
                  >
                    {item.code}
                  </div>
                  <span class="truncate max-w-[220px]" title={item.label}>
                    {item.label}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <CodeModal
        isOpen={!!selectedFilePath()}
        filePath={selectedFilePath()}
        onClose={() => {
          setSelectedFilePath(null);
          setActiveNodeId(null);
        }}
      />
    </div>
  );
}
