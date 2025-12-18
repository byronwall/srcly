import { For, Show, type Accessor } from "solid-js";
import * as d3 from "d3";

type LabelKind = "folder" | "file" | "chunk";

export type TreemapSvgProps = {
  width: number;
  height: number;

  renderNodes: Accessor<d3.HierarchyNode<any>[]>;
  minNodeRenderSizePx: Accessor<number>;

  nominalNodeSizePx: number;
  tinyScale: number;

  isAltPressed: Accessor<boolean>;
  isIsolateMode: Accessor<boolean>;
  enteringKeys: Accessor<Set<string>>;
  collapsedExitKeys: Accessor<Set<string>>;

  getStableNodeKey: (d: any) => string;
  getNodeColor: (d: d3.HierarchyNode<any>) => string;
  getNodeStroke: (d: d3.HierarchyNode<any>) => string;
  getNodeStrokeWidth: (d: d3.HierarchyNode<any>) => number;
  getNodeTextColor: (d: d3.HierarchyNode<any>) => string;
  getChunkLabelColor: (d: d3.HierarchyNode<any>) => string;
  getLabel: (d: d3.HierarchyNode<any>, kind: LabelKind) => string;
  getLabelFontSizePx: (d: d3.HierarchyNode<any>, kind: LabelKind) => number;

  onNodeClick: (d: d3.HierarchyNode<any>, e: MouseEvent) => void;
  onNodeMouseEnter: (e: MouseEvent, d: d3.HierarchyNode<any>) => void;
  onNodeMouseLeave: () => void;
};

export default function TreemapSvg(props: TreemapSvgProps) {
  return (
    <svg
      width={props.width}
      height={props.height}
      style={{
        "shape-rendering": "crispEdges",
        "font-family": "sans-serif",
      }}
    >
      <For each={props.renderNodes()}>
        {(d) => {
          const w = () => Math.max(0, (d as any).x1 - (d as any).x0);
          const h = () => Math.max(0, (d as any).y1 - (d as any).y0);

          // Skip tiny nodes entirely to keep the DOM light. They will naturally
          // appear later when zooming makes their rectangles larger.
          const shouldRender = () =>
            w() >= props.minNodeRenderSizePx() &&
            h() >= props.minNodeRenderSizePx();
          if (!shouldRender()) return null;

          // Avoid division-by-zero; also keeps transforms stable for very tiny nodes.
          const sx = () => Math.max(0.001, w() / props.nominalNodeSizePx);
          const sy = () => Math.max(0.001, h() / props.nominalNodeSizePx);

          const key = () => (d as any).__key ?? props.getStableNodeKey(d);
          const isEntering = () => props.enteringKeys().has(key());
          const isExiting = () => Boolean((d as any).__exit);
          const isExitCollapsed = () => props.collapsedExitKeys().has(key());
          const isRootNode = () => d.depth === 0;

          const tx = () =>
            isEntering() || (isExiting() && isExitCollapsed())
              ? (d as any).x0 + w() / 2
              : (d as any).x0;
          const ty = () =>
            isEntering() || (isExiting() && isExitCollapsed())
              ? (d as any).y0 + h() / 2
              : (d as any).y0;

          const scaleX = () =>
            isEntering() || (isExiting() && isExitCollapsed())
              ? props.tinyScale
              : sx();
          const scaleY = () =>
            isEntering() || (isExiting() && isExitCollapsed())
              ? props.tinyScale
              : sy();

          const opacity = () =>
            isEntering() || (isExiting() && isExitCollapsed()) ? 0 : 1;

          return (
            <g
              transform={`translate(${tx()},${ty()})`}
              style={{
                transition: "transform 0.5s ease-in-out",
                "will-change": "transform",
                opacity: String(opacity()),
                "pointer-events": isExiting() || isRootNode() ? "none" : "auto",
                "transition-property": "transform, opacity",
                "transition-duration": "0.5s",
                "transition-timing-function": "ease-in-out",
              }}
            >
              <g
                transform={`scale(${scaleX()},${scaleY()})`}
                style={{
                  transition: "transform 0.5s ease-in-out",
                }}
              >
                <rect
                  width={props.nominalNodeSizePx}
                  height={props.nominalNodeSizePx}
                  style={{
                    cursor: props.isIsolateMode()
                      ? "zoom-in"
                      : props.isAltPressed()
                      ? "not-allowed"
                      : d.data.type === "folder"
                      ? "zoom-in"
                      : "pointer",
                  }}
                  fill={props.getNodeColor(d)}
                  stroke={props.getNodeStroke(d)}
                  stroke-width={props.getNodeStrokeWidth(d)}
                  vector-effect="non-scaling-stroke"
                  class={`transition-colors duration-100 ${
                    props.isIsolateMode()
                      ? "hover:brightness-125 hover:stroke-white hover:stroke-[2px]"
                      : props.isAltPressed()
                      ? "hover:stroke-red-500 hover:stroke-[3px] hover:opacity-80" // Red border on Alt hover
                      : "hover:brightness-110 hover:stroke-gray-300 hover:stroke-[1.5px]"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onNodeClick(d, e);
                  }}
                  onMouseEnter={(e) => {
                    props.onNodeMouseEnter(e, d);
                  }}
                  onMouseLeave={props.onNodeMouseLeave}
                />
              </g>

              {/* Labels are rendered in unscaled px space so they don't get stretched
                  during non-uniform scale transitions. */}
              <g
                style={{
                  "pointer-events": "none",
                }}
              >
                {/* Folder Labels */}
                <Show when={d.data.type === "folder" && w() > 30 && h() > 20}>
                  <text
                    x={4}
                    y={13}
                    font-size={`${props.getLabelFontSizePx(d, "folder")}px`}
                    font-weight="bold"
                    fill="#888"
                  >
                    {props.getLabel(d, "folder")}
                  </text>
                </Show>

                {/* File Labels */}
                <Show when={d.data.type === "file" && w() > 40 && h() > 15}>
                  <text
                    x={4}
                    y={13}
                    font-size={`${props.getLabelFontSizePx(d, "file")}px`}
                    fill={props.getNodeTextColor(d)}
                  >
                    {props.getLabel(d, "file")}
                  </text>
                </Show>

                {/* Code Chunk Labels */}
                <Show
                  when={
                    d.data.type !== "folder" &&
                    d.data.type !== "file" &&
                    w() > 50 &&
                    h() > 20
                  }
                >
                  <text
                    x={2}
                    y={10}
                    font-size={`${props.getLabelFontSizePx(d, "chunk")}px`}
                    fill={props.getChunkLabelColor(d)}
                    style={{
                      overflow: "hidden",
                    }}
                  >
                    {props.getLabel(d, "chunk")}
                  </text>
                </Show>
              </g>
            </g>
          );
        }}
      </For>
    </svg>
  );
}
