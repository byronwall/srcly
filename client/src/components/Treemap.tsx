import {
  createEffect,
  createMemo,
  createSignal,
  lazy,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from "solid-js";
import * as d3 from "d3";
import { extractFilePath, filterData } from "../utils/dataProcessing";
import { useMetricsStore } from "../utils/metricsStore";
import { addScopeBodyDummyNodes } from "../viz/treemap/utils/tree";
import { resolveNodeByPath } from "../viz/treemap/utils/path";
import TreemapCanvas, {
  type ActivationModifiers,
} from "../viz/treemap/components/TreemapCanvas";
import type { TreemapTile } from "../viz/treemap/utils/hitTest";
import TreemapHeader from "../viz/treemap/components/TreemapHeader";
import TreemapTooltip from "../viz/treemap/components/TreemapTooltip";
import { useTreemapTooltip } from "../viz/treemap/hooks/useTreemapTooltip";

const DependencyGraph = lazy(() => import("./DependencyGraph"));

interface TreemapProps {
  data: any;
  currentRoot?: any;
  onZoom?: (node: any) => void;
  onFileSelect?: (
    path: string,
    startLine?: number,
    endLine?: number,
    node?: any
  ) => void;
  minNodeRenderSizePx?: number;
}

export default function Treemap(props: TreemapProps) {
  let containerRef: HTMLDivElement | undefined;
  const [dimensions, setDimensions] = createSignal({ width: 0, height: 0 });
  const [currentRoot, setCurrentRoot] = createSignal<any>(null);
  const [breadcrumbs, setBreadcrumbs] = createSignal<any[]>([]);
  const [activeExtensions, setActiveExtensions] = createSignal<string[]>([]);
  const [maxLoc, setMaxLoc] = createSignal<number | undefined>(undefined);
  const [showLegend, setShowLegend] = createSignal(false);
  const [isAltPressed, setIsAltPressed] = createSignal(false);
  const [isIsolateMode, setIsIsolateMode] = createSignal(false);
  const [showMetricPopover, setShowMetricPopover] = createSignal(false);
  const [showDependencyGraph, setShowDependencyGraph] = createSignal(false);
  const {
    selectedHotSpotMetrics,
    setSelectedHotSpotMetrics,
    toggleExcludedPath,
    excludedPaths,
  } = useMetricsStore();
  const primaryMetric = () => selectedHotSpotMetrics()[0] || "complexity";
  const { tooltip, show: showTooltip, hide: hideTooltip } = useTreemapTooltip({
    primaryMetricId: primaryMetric,
  });

  const fileMetricsByName = createMemo(() => {
    const map = new Map<string, any>();
    if (!showDependencyGraph()) return map;
    const visit = (node: any) => {
      if (!node) return;
      if (node.type === "file" && node.metrics) map.set(node.name, node.metrics);
      node.children?.forEach(visit);
    };
    visit(props.data);
    return map;
  });

  onMount(() => {
    const resetModifiers = () => {
      setIsIsolateMode(false);
      setIsAltPressed(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Meta" || event.key === "Control") setIsIsolateMode(true);
      if (event.key === "Alt") setIsAltPressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Meta" || event.key === "Control") setIsIsolateMode(false);
      if (event.key === "Alt") setIsAltPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetModifiers);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetModifiers);
    });
  });

  onMount(() => {
    if (!containerRef) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    const dataRoot = props.data;
    const requestedRoot = props.currentRoot;
    if (!dataRoot) {
      setCurrentRoot(null);
      setBreadcrumbs([]);
      return;
    }
    if (requestedRoot && dataRoot) {
      const resolved = resolveNodeByPath(dataRoot, requestedRoot.path);
      if (resolved) {
        setCurrentRoot(resolved.node);
        setBreadcrumbs(resolved.breadcrumbs);
        return;
      }
    }
    if (dataRoot) {
      setCurrentRoot(dataRoot);
      setBreadcrumbs([dataRoot]);
    }
  });

  const toggleExtension = (extension: string) => {
    setActiveExtensions((current) =>
      current.includes(extension)
        ? current.filter((item) => item !== extension)
        : [...current, extension]
    );
  };

  function zoomToNode(nodeData: any) {
    if (props.onZoom) {
      props.onZoom(nodeData);
      return;
    }
    setCurrentRoot(nodeData);
    const resolved = resolveNodeByPath(props.data, nodeData.path);
    if (resolved) setBreadcrumbs(resolved.breadcrumbs);
    else if (props.data) setBreadcrumbs([props.data]);
  }

  function handleHierarchyClick(node: TreemapTile, event: ActivationModifiers) {
    if (event.altKey) {
      if (node.data.path) toggleExcludedPath(node.data.path);
      return;
    }
    if (event.metaKey || event.ctrlKey || node.data.type === "folder") {
      if (props.onZoom) props.onZoom(node.data);
      else zoomToNode(node.data);
      return;
    }
    if (!props.onFileSelect) return;
    const path = extractFilePath(node.data?.path, node.data?.type);
    if (path) {
      props.onFileSelect(
        path,
        node.data?.start_line,
        node.data?.end_line,
        node.data
      );
    }
  }

  const processedData = createMemo(() => {
    const rootData = currentRoot();
    if (!rootData) return null;
    const filteredData = filterData(rootData, {
      extensions: activeExtensions(),
      maxLoc: maxLoc(),
      excludedPaths: excludedPaths(),
    });
    return filteredData ? addScopeBodyDummyNodes(filteredData) : null;
  });

  const layoutRoot = createMemo(() => {
    const data = processedData();
    const { width, height } = dimensions();
    if (!data || width === 0 || height === 0) return null;

    const root = d3
      .hierarchy(data)
      .sum((node: any) => {
        if (!node?.metrics) return 0;
        return node.children?.length ? 0 : node.metrics.loc || 0;
      })
      .sort((a, b) => {
        const aBody = a.data?.type === "function_body" || a.data?.name === "(body)";
        const bBody = b.data?.type === "function_body" || b.data?.name === "(body)";
        if (aBody !== bBody) return aBody ? 1 : -1;
        return (b.value || 0) - (a.value || 0);
      });

    d3
      .treemap()
      .size([width, height])
      .paddingOuter(4)
      .paddingTop(20)
      .paddingInner(2)
      .round(true)
      .tile(d3.treemapBinary)(root);
    return root as d3.HierarchyRectangularNode<any>;
  });

  const layoutNodes = createMemo(() =>
    layoutRoot()
      ?.descendants()
      .filter(
        (node) => node.data?.type !== "function_body" && node.data?.name !== "(body)"
      ) ?? []
  );
  const minNodeRenderSizePx = () => props.minNodeRenderSizePx ?? 4;

  return (
    <div class="plc-panel relative flex h-full w-full flex-col overflow-hidden rounded-none border">
      <TreemapHeader
        data={props.data}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={zoomToNode}
        activeExtensions={activeExtensions}
        onToggleExtension={toggleExtension}
        onClearExtensions={() => setActiveExtensions([])}
        maxLoc={maxLoc}
        onMaxLocChange={setMaxLoc}
        primaryMetricId={primaryMetric}
        selectedHotSpotMetrics={selectedHotSpotMetrics}
        setSelectedHotSpotMetrics={setSelectedHotSpotMetrics}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showMetricPopover={showMetricPopover}
        setShowMetricPopover={setShowMetricPopover}
        showDependencyGraph={showDependencyGraph}
        setShowDependencyGraph={setShowDependencyGraph}
      />

      <div ref={containerRef} class="relative flex-1 overflow-hidden">
        <Suspense fallback={<div class="p-3 text-[var(--plc-on-subtle)]">Loading dependencies…</div>}>
          <Show when={showDependencyGraph()}>
            <DependencyGraph
              path={currentRoot()?.path}
              primaryMetricId={primaryMetric()}
              fileMetricsByName={fileMetricsByName()}
              onClose={() => setShowDependencyGraph(false)}
            />
          </Show>
        </Suspense>
        <Show when={!showDependencyGraph() && layoutRoot()}>
          <TreemapCanvas
            nodes={layoutNodes}
            width={() => dimensions().width}
            height={() => dimensions().height}
            minNodeSize={minNodeRenderSizePx}
            metricId={primaryMetric}
            altPressed={isAltPressed}
            isolateMode={isIsolateMode}
            onActivate={handleHierarchyClick}
            onHover={(event, node) => {
              if (event && node) showTooltip(event, node);
              else hideTooltip();
            }}
          />
        </Show>
        <Show when={!processedData() && !showDependencyGraph()}>
          <div class="flex h-full items-center justify-center text-[var(--plc-on-subtle)]">
            No files match the selected filters
          </div>
        </Show>
      </div>
      <TreemapTooltip model={tooltip} />
    </div>
  );
}
