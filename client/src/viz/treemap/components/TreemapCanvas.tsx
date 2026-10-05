import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { HierarchyRectangularNode } from "d3";
import { truncateTextToWidth } from "../../../utils/svgText";
import {
  treemapFillColor,
  treemapLabelColor,
} from "../utils/colors";
import {
  buildTileHitIndex,
  findTileAt,
  getVisibleTiles,
  type TreemapTile,
} from "../utils/hitTest";

export type ActivationModifiers = Pick<MouseEvent, "metaKey" | "ctrlKey" | "altKey">;

type TreemapCanvasProps = {
  nodes: () => HierarchyRectangularNode<any>[];
  width: () => number;
  height: () => number;
  minNodeSize: () => number;
  metricId: () => string;
  altPressed: () => boolean;
  isolateMode: () => boolean;
  onActivate: (node: TreemapTile, modifiers: ActivationModifiers) => void;
  onHover: (event: MouseEvent | null, node: TreemapTile | null) => void;
};

const FOLDER_STROKE = "#cbd5e1";
const LEAF_STROKE = "#ffffff";
const ACTIVE_STROKE = "#2563eb";
const HIT_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);

function tileKey(node: TreemapTile | null): string | null {
  if (!node) return null;
  if (typeof node.data?.path === "string" && node.data.path) return node.data.path;
  const segments: string[] = [];
  let current: TreemapTile | null = node;
  while (current) {
    segments.push(
      `${current.data?.type ?? "node"}:${current.data?.name ?? ""}:${current.data?.start_line ?? ""}:${current.data?.end_line ?? ""}`
    );
    current = current.parent as TreemapTile | null;
  }
  return segments.reverse().join("/");
}

function relativeDepth(node: TreemapTile): number {
  let current: TreemapTile | null = node;
  while (current) {
    if (current.data?.type === "file") return node.depth - current.depth;
    current = current.parent as TreemapTile | null;
  }
  return node.depth;
}

function labelStyle(node: TreemapTile) {
  const width = Math.max(0, node.x1 - node.x0);
  const height = Math.max(0, node.y1 - node.y0);
  const type = node.data?.type;
  const kind = type === "folder" ? "folder" : type === "file" ? "file" : "chunk";
  const minDim = Math.min(width, height);
  const fontSize = kind === "folder"
    ? Math.min(14, Math.max(9, minDim / 6))
    : kind === "file"
      ? Math.min(12, Math.max(8, minDim / 7))
      : Math.min(13, Math.max(8, minDim / 6));
  const roundedFontSize = Math.round(fontSize * 2) / 2;
  const weight = kind === "folder" ? "700" : "400";
  const x = kind === "chunk" ? 2 : 4;
  const y = kind === "chunk" ? 10 : 13;
  const maxWidth = width - x - 4;
  return {
    kind,
    x,
    y,
    maxWidth,
    fontSize: roundedFontSize,
    font: `${weight} ${roundedFontSize}px sans-serif`,
  };
}

export default function TreemapCanvas(props: TreemapCanvasProps) {
  let canvas: HTMLCanvasElement | undefined;
  const [hovered, setHovered] = createSignal<TreemapTile | null>(null);
  const [activeKey, setActiveKey] = createSignal<string | null>(null);

  const visibleNodes = createMemo(() =>
    getVisibleTiles(props.nodes(), props.width(), props.height(), props.minNodeSize())
  );
  const hitIndex = createMemo(() =>
    buildTileHitIndex(visibleNodes(), props.width(), props.height())
  );
  const active = createMemo(
    () => visibleNodes().find((node) => tileKey(node) === activeKey()) ?? null
  );
  const activeName = () => String(active()?.data?.name ?? "No tile selected");

  function paint() {
    if (!canvas) return;
    const width = props.width();
    const height = props.height();
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.font = "12px sans-serif";
    const nodes = visibleNodes();
    const hoveredNode = hovered();

    for (const node of nodes) {
      const data = node.data;
      const isFolder = data?.type === "folder";
      const isHovered = hoveredNode === node;
      context.save();
      if (isHovered && !props.altPressed() && !props.isolateMode()) {
        context.filter = "brightness(1.1)";
      }
      context.fillStyle = isFolder
        ? "#ffffff"
        : treemapFillColor(props.metricId(), data?.metrics ?? {}, relativeDepth(node));
      context.fillRect(node.x0, node.y0, node.x1 - node.x0, node.y1 - node.y0);
      context.restore();

      context.lineWidth = isHovered
        ? props.altPressed() || props.isolateMode() ? 2 : 1.5
        : isFolder ? 1 : 0.5;
      context.strokeStyle = isHovered && props.altPressed()
        ? "#ef4444"
        : isHovered && props.isolateMode()
          ? "#ffffff"
          : isFolder ? FOLDER_STROKE : LEAF_STROKE;
      const halfPixel = context.lineWidth / 2;
      context.strokeRect(
        node.x0 + halfPixel,
        node.y0 + halfPixel,
        Math.max(0, node.x1 - node.x0 - context.lineWidth),
        Math.max(0, node.y1 - node.y0 - context.lineWidth)
      );

      const widthPx = node.x1 - node.x0;
      const heightPx = node.y1 - node.y0;
      const label = labelStyle(node);
      if (
        (label.kind === "folder" && widthPx > 30 && heightPx > 20) ||
        (label.kind === "file" && widthPx > 40 && heightPx > 15) ||
        (label.kind === "chunk" && widthPx > 50 && heightPx > 20)
      ) {
        const name = String(data?.name ?? "");
        const text = truncateTextToWidth(name, label.maxWidth, label.font);
        if (text) {
          context.font = label.font;
          context.textBaseline = "alphabetic";
          const textColor = label.kind === "folder"
            ? "#888888"
            : treemapLabelColor(
                props.metricId(),
                data?.metrics ?? {},
                relativeDepth(node),
                label.kind === "chunk" ? 0.7 : 1
              );
          context.fillStyle = textColor;
          context.fillText(text, node.x0 + label.x, node.y0 + label.y);
        }
      }
    }

    const activeNode = active();
    if (activeNode && activeNode.depth > 0 && nodes.includes(activeNode)) {
      context.lineWidth = 2.5;
      context.strokeStyle = ACTIVE_STROKE;
      context.strokeRect(
        activeNode.x0 + 1.25,
        activeNode.y0 + 1.25,
        Math.max(0, activeNode.x1 - activeNode.x0 - 2.5),
        Math.max(0, activeNode.y1 - activeNode.y0 - 2.5)
      );
    }
  }

  let drawFrame = 0;
  function schedulePaint() {
    if (drawFrame) cancelAnimationFrame(drawFrame);
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      paint();
    });
  }

  function nodeAtEvent(event: Pick<MouseEvent, "clientX" | "clientY">): TreemapTile | null {
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return findTileAt(hitIndex(), x, y, props.width());
  }

  function updateHover(event: PointerEvent) {
    const node = nodeAtEvent(event);
    if (canvas) {
      canvas.style.cursor = !node
        ? "default"
        : props.altPressed()
          ? "not-allowed"
          : props.isolateMode() || node.data?.type === "folder"
            ? "zoom-in"
            : "pointer";
    }
    if (node === hovered()) return;
    setHovered(() => node);
    props.onHover(event, node);
    schedulePaint();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (HIT_KEYS.has(event.key)) {
      event.preventDefault();
      const selectable = visibleNodes().filter((node) => node.depth > 0);
      if (!selectable.length) return;
      const current = selectable.findIndex(
        (node) => tileKey(node) === activeKey()
      );
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const next = current < 0
        ? 0
        : (current + direction + selectable.length) % selectable.length;
      setActiveKey(tileKey(selectable[next]));
      schedulePaint();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      const node = active() ?? hovered();
      if (!node) return;
      event.preventDefault();
      props.onActivate(node, event);
    }
  }

  createEffect(() => {
    visibleNodes();
    hitIndex();
    hovered();
    activeKey();
    active();
    const currentHovered = hovered();
    if (currentHovered && !visibleNodes().includes(currentHovered)) {
      setHovered(null);
      props.onHover(null, null);
    }
    props.metricId();
    props.altPressed();
    props.isolateMode();
    schedulePaint();
  });

  onMount(() => {
    const onWindowResize = () => schedulePaint();
    window.addEventListener("resize", onWindowResize);
    onCleanup(() => window.removeEventListener("resize", onWindowResize));
  });

  onCleanup(() => {
    if (drawFrame) cancelAnimationFrame(drawFrame);
    props.onHover(null, null);
  });

  return (
    <>
      <canvas
        ref={canvas}
        class="absolute inset-0 block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--plc-border-focus)]"
        role="group"
        aria-label="Treemap. Use arrow keys to select a tile and Enter to open it."
        aria-describedby="treemap-active-tile"
        tabIndex={0}
        onPointerMove={updateHover}
        onPointerLeave={(event) => {
          setHovered(null);
          props.onHover(event, null);
          schedulePaint();
        }}
        onClick={(event) => {
          const node = nodeAtEvent(event);
          if (node) props.onActivate(node, event);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!active()) {
            setActiveKey(
              tileKey(visibleNodes().find((node) => node.depth > 0) ?? null)
            );
          }
        }}
      >
        Treemap view
      </canvas>
      <span id="treemap-active-tile" class="sr-only" aria-live="polite">
        {activeName()}
      </span>
    </>
  );
}
