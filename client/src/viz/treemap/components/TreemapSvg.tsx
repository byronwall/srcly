import { For, Show, type Accessor } from "solid-js";

type LabelKind = "folder" | "file" | "chunk";

export type TreemapRenderNode = {
  __key: string;
  __exit?: boolean;

  // geometry
  x0: number;
  y0: number;
  x1: number;
  y1: number;

  depth: number;

  // for labels/color/click
  data: any;

  // only needed because getRelativeDepth walks parents
  parent: TreemapRenderNode | null;
};

export type TreemapSvgProps = {
  width: number;
  height: number;

  renderNodes: Accessor<TreemapRenderNode[]>;
  layoutTick: Accessor<number>;
  minNodeRenderSizePx: Accessor<number>;

  nominalNodeSizePx: number;
  tinyScale: number;

  isAltPressed: Accessor<boolean>;
  isIsolateMode: Accessor<boolean>;
  enteringKeys: Accessor<Set<string>>;
  collapsedExitKeys: Accessor<Set<string>>;

  getNodeColor: (d: TreemapRenderNode) => string;
  getNodeStroke: (d: TreemapRenderNode) => string;
  getNodeStrokeWidth: (d: TreemapRenderNode) => number;
  getNodeTextColor: (d: TreemapRenderNode) => string;
  getChunkLabelColor: (d: TreemapRenderNode) => string;
  getLabel: (d: TreemapRenderNode, kind: LabelKind) => string;
  getLabelFontSizePx: (d: TreemapRenderNode, kind: LabelKind) => number;

  onNodeClick: (d: TreemapRenderNode, e: MouseEvent) => void;
  onNodeMouseEnter: (e: MouseEvent, d: TreemapRenderNode) => void;
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
          // Touch the tick inside this scope so all derived computations can
          // re-evaluate after each layout, even though `d` is a plain object.
          const tick = () => props.layoutTick();

          const w = () => {
            tick();
            return Math.max(0, d.x1 - d.x0);
          };
          const h = () => {
            tick();
            return Math.max(0, d.y1 - d.y0);
          };

          // Skip tiny nodes entirely to keep the DOM light. They will naturally
          // appear later when zooming makes their rectangles larger.
          const shouldRender = () => {
            tick();
            return (
              w() >= props.minNodeRenderSizePx() &&
              h() >= props.minNodeRenderSizePx()
            );
          };

          // Avoid division-by-zero; also keeps transforms stable for very tiny nodes.
          const sx = () => {
            tick();
            return Math.max(0.001, w() / props.nominalNodeSizePx);
          };
          const sy = () => {
            tick();
            return Math.max(0.001, h() / props.nominalNodeSizePx);
          };

          const key = () => d.__key;
          const isEntering = () => props.enteringKeys().has(key());
          const isExiting = () => Boolean(d.__exit);
          const isExitCollapsed = () => props.collapsedExitKeys().has(key());
          const isRootNode = () => {
            tick();
            return d.depth === 0;
          };

          const tx = () => {
            tick();
            return isEntering() || (isExiting() && isExitCollapsed())
              ? d.x0 + w() / 2
              : d.x0;
          };
          const ty = () => {
            tick();
            return isEntering() || (isExiting() && isExitCollapsed())
              ? d.y0 + h() / 2
              : d.y0;
          };

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
            <Show when={shouldRender()}>
              <g
                transform={`translate(${tx()},${ty()})`}
                style={{
                  transition: "transform 0.5s ease-in-out",
                  "will-change": "transform",
                  opacity: String(opacity()),
                  "pointer-events":
                    isExiting() || isRootNode() ? "none" : "auto",
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
                    fill={(tick(), props.getNodeColor(d))}
                    stroke={(tick(), props.getNodeStroke(d))}
                    stroke-width={(tick(), props.getNodeStrokeWidth(d))}
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
                      font-size={`${
                        (tick(), props.getLabelFontSizePx(d, "folder"))
                      }px`}
                      font-weight="bold"
                      fill="#888"
                    >
                      {(tick(), props.getLabel(d, "folder"))}
                    </text>
                  </Show>

                  {/* File Labels */}
                  <Show when={d.data.type === "file" && w() > 40 && h() > 15}>
                    <text
                      x={4}
                      y={13}
                      font-size={`${
                        (tick(), props.getLabelFontSizePx(d, "file"))
                      }px`}
                      fill={(tick(), props.getNodeTextColor(d))}
                    >
                      {(tick(), props.getLabel(d, "file"))}
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
                      font-size={`${
                        (tick(), props.getLabelFontSizePx(d, "chunk"))
                      }px`}
                      fill={(tick(), props.getChunkLabelColor(d))}
                      style={{
                        overflow: "hidden",
                      }}
                    >
                      {(tick(), props.getLabel(d, "chunk"))}
                    </text>
                  </Show>
                </g>
              </g>
            </Show>
          );
        }}
      </For>
    </svg>
  );
}
