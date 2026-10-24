import { ExternalLink, X } from "lucide-solid";
import { createMemo, For, type JSX, Show } from "solid-js";
import type { AnchorGraphResult, RouteGraphResult } from "../../../dataflow/contract.generated";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import type { FlowBox, FlowViewModel } from "./adapter";
import { FlowMarkGlyph } from "./FlowMark";
import { anchorOverview, nodeDetails, routeOverview, STATUS_WORD, type AnchorOverview, type NeighborRow } from "./inspectorModel";
import { FLOW_MARKS, REPETITION_BADGE, type FlowMark } from "./marks";
import type { Reach } from "./reach";

const STATUS_CLASS: Record<"proven" | "partial" | "unsupported", string> = {
  proven: "text-[var(--plc-success)]",
  partial: "text-[var(--plc-warning)]",
  unsupported: "text-[var(--plc-error)]",
};
const H = "pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]";
const ROW = "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-[var(--plc-surface-hover)]";

function Mark(props: { mark: FlowMark }) {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" class="shrink-0">
      <FlowMarkGlyph mark={props.mark} x={0} y={0} />
    </svg>
  );
}

function Stat(props: { label: string; value: number | string; title?: string }) {
  return (
    <div class="flex items-baseline justify-between gap-2" title={props.title}>
      <span class="text-[var(--plc-on-muted)]">{props.label}</span>
      <span class="plc-data-sm font-semibold tabular-nums text-[var(--plc-on-surface)]">{props.value}</span>
    </div>
  );
}

function Where(props: { file: string; line: number; onOpen: () => void }) {
  return (
    <button type="button" class={`${ROW} plc-data-sm !font-normal text-[var(--plc-on-muted)]`} onClick={props.onOpen} title="Open in the code viewer">
      <span class="min-w-0 truncate">
        {props.file}:{props.line}
      </span>
      <ExternalLink size={11} aria-hidden="true" class="ml-auto shrink-0" />
    </button>
  );
}

function NeighborList(props: { title: string; rows: NeighborRow[]; onSelect: (id: string) => void }) {
  return (
    <Show when={props.rows.length}>
      <h4 class={H}>
        {props.title} <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· {props.rows.length}</span>
      </h4>
      <ul>
        <For each={props.rows}>
          {(r) => (
            <li>
              <button type="button" class={ROW} onClick={() => props.onSelect(r.id)} title={`Select ${r.label}`}>
                <Mark mark={r.mark} />
                <span class="min-w-0 truncate text-[var(--plc-on-surface)]">{r.label}</span>
                <span class="ml-auto shrink-0 text-[10.5px] text-[var(--plc-on-subtle)]">
                  {r.kind}
                  <Show when={r.path}>{(p) => <span class="pl-1 text-[var(--plc-accent)]">{p()}</span>}</Show>
                  <Show when={r.status !== "proven" ? r.status : undefined}>{(s) => <span class={`pl-1 ${STATUS_CLASS[s()]}`}>{STATUS_WORD[s()]}</span>}</Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

/**
 * Data flow mode's right rail: the route's overview when nothing is selected
 * (counts, origins with their reach, the engine's gaps), else the selected
 * box in full: kind, status, where it lives, its reach, what is inside its
 * frame, and what flows in and out, each a click away.
 */
export function FlowInspector(props: {
  /** The route graph, in route mode. */
  graph: RouteGraphResult | null;
  /** The anchor graph, in anchor mode. */
  anchor?: AnchorGraphResult | null;
  model: FlowViewModel;
  rootPath: string;
  selected: string | null;
  reach: Reach | null;
  /** Flow node ids whose frames are opened in place. */
  open: string[];
  onOpen: (absPath: string, line: number) => void;
  onSelect: (id: string | null) => void;
  onPickOrigin: (id: string | undefined) => void;
  onToggleFrame: (id: string) => void;
  onClose: () => void;
}) {
  const details = createMemo(() => (props.selected ? nodeDetails(props.model, props.selected) : null));
  const overview = createMemo(() => (props.graph ? routeOverview(props.graph, props.model, props.rootPath) : null));
  const anchor = createMemo(() => (props.anchor ? anchorOverview(props.anchor) : null));
  const repetition = (n: FlowBox) => ("repetition" in n && (n.repetition === "conditional" || n.repetition === "collection") ? n.repetition : null);
  const external = (n: FlowBox) => "external" in n && n.external;
  const typeText = (n: FlowBox) => ("typeText" in n ? n.typeText : null);
  const noteOf = (n: FlowBox) => ("note" in n ? n.note : null);
  const section = (title: string, body: JSX.Element) => (
    <>
      <h4 class={H}>{title}</h4>
      {body}
    </>
  );
  return (
    <aside class="flex w-[19rem] shrink-0 flex-col border-l border-[var(--plc-border)] bg-[var(--plc-surface)] text-[12px]" aria-label="Data flow inspector">
      <div class="flex items-center justify-between gap-2 border-b border-[var(--plc-border)] py-1 pl-2.5 pr-1">
        <span class="font-semibold text-[var(--plc-on-surface)]">{details() ? "Selected box" : props.anchor ? "Anchor" : "Route"}</span>
        <div class="flex items-center gap-1">
          <Show when={details()}>
            <Button variant="ghost" size="sm" class="px-1.5" onClick={() => props.onSelect(null)} title="Back to the overview (Esc)">
              {props.anchor ? "Anchor" : "Route"}
            </Button>
          </Show>
          <IconButton label="Hide inspector (I)" size="xs" onClick={props.onClose}>
            <X size={13} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Show
          when={details()}
          fallback={
            <Show when={anchor()} fallback={<Show when={overview()}>{(o) => <Overview o={o()} onOpen={props.onOpen} onPickOrigin={props.onPickOrigin} />}</Show>}>
              {(a) => <AnchorOverviewView o={a()} onOpen={props.onOpen} onSelect={props.onSelect} />}
            </Show>
          }
        >
          {(d) => (
            <>
              <div class="flex items-center gap-1.5 pt-2">
                <Mark mark={d().mark} />
                <span class="plc-data-sm min-w-0 break-all font-semibold text-[var(--plc-on-surface)]">{d().node.label}</span>
              </div>
              <div class="flex flex-wrap items-baseline gap-x-2 pl-5 text-[11px]">
                <span class="text-[var(--plc-on-muted)]">{FLOW_MARKS[d().mark].label}</span>
                <span class={`font-semibold ${STATUS_CLASS[d().node.status]}`}>{STATUS_WORD[d().node.status]}</span>
                <Show when={repetition(d().node)}>{(r) => <span class="text-[var(--plc-on-muted)]">{REPETITION_BADGE[r()].title.toLowerCase()}</span>}</Show>
                <Show when={external(d().node)}>
                  <span class="text-[var(--plc-on-muted)]">external</span>
                </Show>
              </div>
              <Show when={d().detail}>{(t) => <div class="pl-5 text-[11px] text-[var(--plc-on-muted)]">{t()}</div>}</Show>
              <Show when={typeText(d().node)}>{(t) => <div class="plc-data-sm pl-5 !font-normal text-[var(--plc-on-muted)]" title="The checked type (TypeScript, or mypy for Python)">{t()}</div>}</Show>
              <Show when={noteOf(d().node)}>{(t) => <div class="pl-5 text-[11px] text-[var(--plc-on-muted)]">{t()}</div>}</Show>
              <Show when={d().node.reason}>{(r) => <div class="pl-5 text-[11px] text-[var(--plc-warning)]">{r()}</div>}</Show>
              <Where file={d().node.file} line={d().node.line} onOpen={() => props.onOpen(d().node.absPath, d().node.line)} />

              <Show when={props.reach}>
                {(r) => section("Reach", (
                  <div class="space-y-px">
                    <Stat label="Proven to reach it" value={r().counts.up} title="Boxes upstream over proven edges" />
                    <Stat label="It reaches" value={r().counts.down} title="Boxes downstream over proven edges" />
                    <Show when={r().counts.frontier}>
                      <Stat label="Stops at frontiers" value={r().counts.frontier} title="Boxes beyond a non-proven edge" />
                    </Show>
                  </div>
                ))}
              </Show>

              <Show when={d().inside.shown || d().inside.hidden || d().inside.wrappers}>
                {section("Inside its frame", (
                  <div class="space-y-px">
                    <Show when={d().inside.shown}><Stat label="Boxes drawn" value={d().inside.shown} /></Show>
                    <Show when={d().inside.hidden}><Stat label="Folded into it" value={d().inside.hidden} /></Show>
                    <Show when={d().inside.wrappers}><Stat label="Wrappers rolled in" value={d().inside.wrappers} /></Show>
                    <Show when={d().inside.hidden || props.open.includes(d().node.id)}>
                      <Button variant="ghost" size="sm" class="mt-1 px-1.5" onClick={() => props.onToggleFrame(d().node.id)}>
                        {props.open.includes(d().node.id) ? "Fold the frame" : `Open the frame · ${d().inside.hidden}`}
                      </Button>
                    </Show>
                  </div>
                ))}
              </Show>

              <NeighborList title="Flows in" rows={d().flowsIn} onSelect={props.onSelect} />
              <NeighborList title="Flows out" rows={d().flowsOut} onSelect={props.onSelect} />
              <Show when={props.graph && d().node.kind === "origin"}>
                <Button variant="ghost" size="sm" class="mt-2 px-1.5" onClick={() => props.onPickOrigin(props.graph!.selectedSource === d().node.id ? undefined : d().node.id)}>
                  {props.graph!.selectedSource === d().node.id ? "Stop lighting its destinations" : "Light its proven destinations"}
                </Button>
              </Show>
            </>
          )}
        </Show>
      </div>
    </aside>
  );
}

function Overview(props: { o: ReturnType<typeof routeOverview>; onOpen: (absPath: string, line: number) => void; onPickOrigin: (id: string | undefined) => void }) {
  const o = () => props.o;
  const status = () => (o().status === "complete" ? "proven" : o().status === "partial" ? "partial" : "unsupported") as "proven" | "partial" | "unsupported";
  return (
    <>
      <div class="flex items-center gap-1.5 pt-2">
        <Mark mark="route" />
        <span class="plc-data-sm font-semibold text-[var(--plc-on-surface)]">{o().pathPattern}</span>
      </div>
      <div class="flex flex-wrap items-baseline gap-x-2 pl-5 text-[11px]">
        <span class={`font-semibold ${STATUS_CLASS[status()]}`}>{o().status === "complete" ? "complete" : o().status}</span>
        <span class="text-[var(--plc-on-muted)]">generation {o().generation}</span>
      </div>
      <Show when={o().unavailableReason}>{(r) => <div class="pl-5 text-[11px] text-[var(--plc-warning)]">{r()}</div>}</Show>
      <Where file={o().file} line={1} onOpen={() => props.onOpen(o().absPath, 1)} />
      <h4 class={H}>Surface</h4>
      <div class="grid grid-cols-2 gap-x-3 gap-y-px">
        <Stat label="Occurrences" value={o().counts.occurrences} />
        <Stat label="Boundaries" value={o().counts.boundaries} />
        <Stat label="Terminals" value={o().counts.terminals} />
        <Stat label="Origins" value={o().counts.origins} />
        <Stat label="Handoffs" value={o().counts.handoffs} title="Origins proven to reach a render site" />
        <Stat label="Folded" value={o().counts.folded} title="Boxes folded into frames by the box budget; Shift-click a frame to open it" />
        <Show when={o().counts.omittedItems}>
          <Stat label="Omitted by engine" value={o().counts.omittedItems} title="Items the engine left out of the surface" />
        </Show>
      </div>
      <h4 class={H}>
        Origins <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· click lights its reach</span>
      </h4>
      <ul>
        <For each={o().origins}>
          {(or) => (
            <li>
              <button type="button" class={ROW} onClick={() => props.onPickOrigin(or.id)} title={`Light what ${or.label} is proven to reach`}>
                <Mark mark="origin" />
                <span class="min-w-0 truncate text-[var(--plc-on-surface)]">{or.label}</span>
                <span class="ml-auto shrink-0 text-[10.5px] text-[var(--plc-on-subtle)]">
                  {or.roles}
                  <span class="pl-1 tabular-nums" title="Render sites it is proven to reach">→ {or.reaches}</span>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={o().gaps.length}>
        <h4 class={H}>
          Gaps <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· where the engine could not follow</span>
        </h4>
        <ul>
          <For each={o().gaps}>
            {(g) => (
              <li>
                <button
                  type="button"
                  class={`${ROW} flex-col !items-start gap-0`}
                  disabled={!g.absPath}
                  onClick={() => g.absPath && g.line && props.onOpen(g.absPath, g.line)}
                  title={g.absPath ? "Open in the code viewer" : undefined}
                >
                  <span class="text-[var(--plc-on-surface)]">{g.label}</span>
                  <span class="text-[10.5px] text-[var(--plc-warning)]">
                    {g.reason}
                    <Show when={g.file}>
                      <span class="text-[var(--plc-on-subtle)]">
                        {" "}· {g.file}:{g.line}
                      </span>
                    </Show>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}

const DIRECTION_WORD: Record<AnchorOverview["direction"], string> = { forward: "where it goes", backward: "where it comes from", both: "where it comes from and where it goes" };

function AnchorOverviewView(props: { o: AnchorOverview; onOpen: (absPath: string, line: number) => void; onSelect: (id: string | null) => void }) {
  const o = () => props.o;
  const status = () => (o().outcome === "ok" ? "proven" : o().outcome === "unsupported" ? "unsupported" : "partial") as "proven" | "partial" | "unsupported";
  const list = (title: string, rows: AnchorOverview["origins"], mark: "origin" | "terminal") => (
    <Show when={rows.length}>
      <h4 class={H}>
        {title} <span class="font-normal normal-case tracking-normal text-[var(--plc-on-subtle)]">· click selects</span>
      </h4>
      <ul>
        <For each={rows}>
          {(r) => (
            <li>
              <button type="button" class={ROW} onClick={() => props.onSelect(r.id)} title={`Select ${r.label}`}>
                <Mark mark={mark} />
                <span class="min-w-0 truncate text-[var(--plc-on-surface)]">{r.label}</span>
                <span class="ml-auto shrink-0 text-[10.5px] text-[var(--plc-on-subtle)]">
                  {r.roles}
                  <Show when={r.status !== "proven"}>
                    <span class={`pl-1 ${STATUS_CLASS[r.status]}`}>{STATUS_WORD[r.status]}</span>
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
  return (
    <>
      <div class="flex items-center gap-1.5 pt-2">
        <Mark mark="anchor" />
        <span class="plc-data-sm min-w-0 break-all font-semibold text-[var(--plc-on-surface)]">{o().text}</span>
      </div>
      <div class="flex flex-wrap items-baseline gap-x-2 pl-5 text-[11px]">
        <span class="text-[var(--plc-on-muted)]">{o().kind}</span>
        <span class={`font-semibold ${STATUS_CLASS[status()]}`}>{o().outcome}</span>
        <span class="text-[var(--plc-on-muted)]">generation {o().generation}</span>
      </div>
      <Show when={o().typeText}>{(t) => <div class="plc-data-sm pl-5 !font-normal text-[var(--plc-on-muted)]" title="The checked type (TypeScript, or mypy for Python)">{t()}</div>}</Show>
      <div class="pl-5 text-[11px] text-[var(--plc-on-muted)]">Traced {DIRECTION_WORD[o().direction]}</div>
      <Show when={o().reason}>{(r) => <div class="pl-5 text-[11px] text-[var(--plc-warning)]">{r()}</div>}</Show>
      <Where file={o().file} line={o().line} onOpen={() => props.onOpen(o().absPath, o().line)} />
      <h4 class={H}>Reach</h4>
      <div class="grid grid-cols-2 gap-x-3 gap-y-px">
        <Stat label="Comes from" value={o().counts.up} title="Boxes upstream of the anchor" />
        <Stat label="Goes to" value={o().counts.down} title="Boxes downstream of the anchor" />
        <Stat label="Origins" value={o().counts.origins} />
        <Stat label="Terminals" value={o().counts.terminals} />
        <Stat label="Functions" value={o().counts.scopes} title="Frames: the functions and modules that own the boxes" />
        <Show when={o().counts.boundaries}>
          <Stat label="Boundaries" value={o().counts.boundaries} title="Where the proof cannot follow" />
        </Show>
        <Show when={o().counts.frontiers}>
          <Stat label="Frontiers" value={o().counts.frontiers} title="Gaps the engine reported" />
        </Show>
      </div>
      {list("Origins", o().origins, "origin")}
      {list("Terminals", o().terminals, "terminal")}
      <h4 class={H}>Evidence</h4>
      <div class="text-[11px] text-[var(--plc-on-muted)]">
        {o().coverage.elements} elements · {o().coverage.relations} relations · budget {o().coverage.budget.used} of {o().coverage.budget.limit}
        {o().coverage.budget.exhausted ? " · exhausted" : ""}
      </div>
    </>
  );
}
