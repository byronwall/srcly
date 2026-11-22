/* @refresh reload */
// Dev-only page (client/panel-harness.html): the four panel components on sample data.
import { render } from "solid-js/web";
import { createMemo, createSignal, For, type JSX } from "solid-js";
import "../../index.css";
import catalog from "../../../../server/tests/snapshots/metric-catalog.json";
import { setMetricCatalog, type MetricCatalog } from "../../utils/metricsStore";
import type { LensHunkDiff } from "../types";
import { ChunkInspector, CommitRail, HunkDiff, ReviewBuckets } from "./index";
import { bigHunkDiff, emptyPayload, sampleHunkDiff, samplePayload } from "./sample";

setMetricCatalog(catalog as MetricCatalog);

type DiffState = "none" | "loaded" | "loading" | "error" | "same" | "big";

function Pick<T extends string | number>(props: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <label class="flex items-center gap-1.5 text-[12px] text-[var(--plc-on-muted)]">
      {props.label}
      <select
        data-harness={props.label.toLowerCase()}
        class="h-6 rounded border border-[var(--plc-border)] bg-[var(--plc-surface)] px-1 text-[12px]"
        value={String(props.value)}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          props.onChange((typeof props.value === "number" ? Number(raw) : raw) as T);
        }}
      >
        <For each={props.options}>{(o) => <option value={String(o)}>{String(o)}</option>}</For>
      </select>
    </label>
  );
}

function Panel(props: { title: string; width?: number; children: JSX.Element; class?: string }) {
  return (
    <div
      class={`flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--plc-border)] bg-[var(--plc-surface)] ${props.class ?? ""}`}
      style={props.width ? { width: `${props.width}px` } : undefined}
    >
      <div class="plc-label-caps shrink-0 border-b border-[var(--plc-divider)] px-3 py-2 text-[var(--plc-on-disabled)]">
        {props.title}
      </div>
      <div class="min-h-0 flex-1 overflow-auto">{props.children}</div>
    </div>
  );
}

function Harness() {
  const params = new URLSearchParams(location.search);
  const [data, setData] = createSignal<"sample" | "empty">(params.get("data") === "empty" ? "empty" : "sample");
  const [width, setWidth] = createSignal(Number(params.get("w") ?? 340));
  const [chunkId, setChunkId] = createSignal<string | null>(params.get("chunk"));
  const [commit, setCommit] = createSignal<string | null>(null);
  const [diffState, setDiffState] = createSignal<DiffState>((params.get("diff") as DiffState) ?? "loaded");
  const [diffCommit, setDiffCommit] = createSignal<string | undefined>();
  const [log, setLog] = createSignal("—");

  const payload = () => (data() === "sample" ? samplePayload : emptyPayload);
  const chunk = createMemo(() => payload().chunks.find((c) => c.id === chunkId()) ?? null);
  const diff = createMemo((): LensHunkDiff | null => {
    const s = diffState();
    if (s === "none" || s === "loading" || s === "error") return null;
    if (s === "big") return bigHunkDiff(2000);
    const c = chunk();
    const base = {
      ...sampleHunkDiff,
      ...(c ? { chunkId: c.id, path: c.path, oldPath: c.oldPath } : {}),
      ...(diffCommit() ? { from: "parent", to: diffCommit()!.slice(0, 7) } : {}),
    };
    return s === "same" ? { ...base, diff: "" } : base;
  });

  return (
    <div class="flex h-screen flex-col gap-2 bg-[var(--plc-neutral)] p-3" data-harness-root>
      <div class="flex flex-wrap items-center gap-4">
        <span class="text-[13px] font-semibold">Change Lens panel</span>
        <Pick label="Data" value={data()} options={["sample", "empty"]} onChange={(v) => { setData(v); setChunkId(null); setCommit(null); }} />
        <Pick label="Width" value={width()} options={[280, 340, 420, 520]} onChange={setWidth} />
        <Pick
          label="Diff"
          value={diffState()}
          options={["none", "loaded", "loading", "error", "same", "big"]}
          onChange={setDiffState}
        />
        <span class="plc-data-sm min-w-0 truncate text-[var(--plc-on-subtle)]" data-harness-log>
          last call: {log()}
        </span>
      </div>
      <Panel title="CommitRail" class="shrink-0">
        <div class="px-3 py-2">
          <CommitRail
            commits={payload().commits}
            selected={commit()}
            onSelect={(sha) => {
              setCommit(sha);
              setLog(`CommitRail.onSelect(${sha})`);
            }}
            highlightChunk={chunkId()}
            timeZone={payload().selection.timezone}
          />
        </div>
      </Panel>
      <div class="flex min-h-0 flex-1 gap-2">
        <Panel title="ReviewBuckets" width={width()}>
          <ReviewBuckets
            payload={payload()}
            selected={chunkId()}
            onSelect={(id) => {
              setChunkId(id);
              setLog(`ReviewBuckets.onSelect(${id})`);
            }}
          />
        </Panel>
        <Panel title="ChunkInspector" width={width()}>
          <ChunkInspector
            payload={payload()}
            chunk={chunk()}
            onOpenHunk={(id, sha) => {
              setDiffCommit(sha);
              setDiffState("loaded");
              setLog(`onOpenHunk(${id}${sha ? `, ${sha.slice(0, 8)}` : ""})`);
            }}
            onOpenCode={(c) => setLog(`onOpenCode(${c.path}:${c.startLine})`)}
          />
        </Panel>
        <Panel title="HunkDiff" class="min-w-0 flex-1">
          <HunkDiff
            diff={diff()}
            loading={diffState() === "loading"}
            error={diffState() === "error" ? "git show failed: bad revision 'f6b8f6b'" : undefined}
            onClose={() => {
              setDiffState("none");
              setLog("HunkDiff.onClose()");
            }}
          />
        </Panel>
      </div>
    </div>
  );
}

render(() => <Harness />, document.getElementById("root")!);
