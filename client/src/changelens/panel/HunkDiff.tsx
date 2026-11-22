import { X } from "lucide-solid";
import { createMemo, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { IconButton } from "../../components/ui/IconButton";
import type { LensHunkDiff } from "../types";
import { breakablePath } from "../../compare/bits";
import { parseUnifiedDiff, type DiffLine } from "./parseUnifiedDiff";

const ROW_BG: Record<DiffLine["kind"], string> = {
  add: "var(--plc-success-subtle)",
  del: "var(--plc-error-subtle)",
  ctx: "transparent",
  note: "transparent",
};
const HIT_BG: Record<"add" | "del", string> = { add: "#c6f0d4", del: "#fbd0d0" };
const SIGN: Record<DiffLine["kind"], string> = { add: "+", del: "−", ctx: " ", note: "" };

function Line(props: { line: DiffLine }) {
  const l = props.line;
  return (
    <div class="flex min-w-full" data-line={l.kind} style={{ background: ROW_BG[l.kind] }}>
      <span class="w-[5ch] shrink-0 select-none pr-1.5 text-right text-[var(--plc-on-disabled)]">{l.old ?? ""}</span>
      <span class="w-[5ch] shrink-0 select-none pr-1.5 text-right text-[var(--plc-on-disabled)]">{l.new ?? ""}</span>
      <span
        class="w-[2ch] shrink-0 select-none text-center"
        style={{ color: l.kind === "add" ? "var(--plc-success)" : l.kind === "del" ? "var(--plc-error)" : undefined }}
      >
        {SIGN[l.kind]}
      </span>
      <Show
        when={l.kind !== "note"}
        fallback={<span class="italic text-[var(--plc-on-subtle)]">{l.text}</span>}
      >
        <span class="whitespace-pre-wrap break-all pr-3 text-[var(--plc-code-text)]">
          <Show when={l.spans} fallback={l.text || " "}>
            {(spans) => (
              <For each={spans()}>
                {(s) =>
                  s.hit ? (
                    <span class="rounded-[2px]" style={{ background: HIT_BG[l.kind as "add" | "del"] }}>
                      {s.text}
                    </span>
                  ) : (
                    s.text
                  )
                }
              </For>
            )}
          </Show>
        </span>
      </Show>
    </div>
  );
}

/** The diff text behind one chunk, with line numbers and word highlights. Esc closes it. */
export function HunkDiff(props: { diff: LensHunkDiff | null; loading: boolean; error?: string; onClose: () => void }) {
  const hunks = createMemo(() => (props.diff ? parseUnifiedDiff(props.diff.diff) : []));
  const counts = createMemo(() => {
    let added = 0;
    let deleted = 0;
    for (const h of hunks())
      for (const l of h.lines) {
        if (l.kind === "add") added++;
        else if (l.kind === "del") deleted++;
      }
    return { added, deleted };
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) props.onClose();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div data-hunk-diff class="flex h-full min-h-0 min-w-0 flex-col bg-[var(--plc-surface)]">
      <header class="flex min-h-10 shrink-0 items-center gap-2 border-b border-[var(--plc-border)] px-3 py-1.5">
        <div class="min-w-0 flex-1">
          <Show when={props.diff} fallback={<p class="text-[12px] font-medium text-[var(--plc-on-muted)]">Diff</p>}>
            {(d) => (
              <p class="plc-data-sm truncate text-[var(--plc-on-surface)]" title={d().path}>
                {breakablePath(d().path)}
              </p>
            )}
          </Show>
          <p class="mt-0.5 flex min-w-0 items-baseline gap-2 text-[11px] text-[var(--plc-on-subtle)]">
            <Show when={props.diff} fallback={<span>&nbsp;</span>}>
              {(d) => (
                <>
                  <span class="truncate" data-diff-range>
                    {d().from} → {d().to}
                  </span>
                  <Show when={d().oldPath}>
                    <span class="truncate" title={d().oldPath}>
                      from {d().oldPath}
                    </span>
                  </Show>
                  <Show when={d().truncated}>
                    <span class="shrink-0 text-[var(--plc-warning)]">clipped</span>
                  </Show>
                  <span class="plc-data-sm ml-auto shrink-0">
                    <span class="text-[var(--plc-success)]">+{counts().added}</span>{" "}
                    <span class="text-[var(--plc-error)]">−{counts().deleted}</span>
                  </span>
                </>
              )}
            </Show>
          </p>
        </div>
        <IconButton label="Close diff (Esc)" size="xs" data-action="close-diff" onClick={() => props.onClose()}>
          <X size={14} aria-hidden="true" />
        </IconButton>
      </header>
      <div class="min-h-0 flex-1 overflow-auto bg-[var(--plc-code-bg)]">
        <Switch>
          <Match when={props.error}>
            <p class="m-3 rounded border border-[var(--plc-error-border)] bg-[var(--plc-error-subtle)] px-2.5 py-2 text-[12px] text-[var(--plc-error)]" data-diff-error>
              Couldn't load the diff: {props.error}
            </p>
          </Match>
          <Match when={props.loading}>
            <div class="space-y-1.5 p-3" data-diff-loading aria-label="Loading diff">
              <For each={[72, 48, 88, 60, 40, 80, 55]}>
                {(w) => <div class="h-3 animate-pulse rounded bg-[var(--plc-surface-muted)]" style={{ width: `${w}%` }} />}
              </For>
            </div>
          </Match>
          <Match when={!props.diff}>
            <p class="p-3 text-[12px] text-[var(--plc-on-subtle)]">Open a chunk's diff to see its lines here.</p>
          </Match>
          <Match when={!hunks().length}>
            <p class="p-3 text-[12px] text-[var(--plc-on-subtle)]" data-diff-same>
              No line differs between these two sides.
            </p>
          </Match>
          <Match when={true}>
            <div class="py-1 font-mono text-[12px] leading-[18px]">
              <For each={hunks()}>
                {(h) => (
                  <div data-hunk>
                    <div class="flex gap-2 bg-[var(--plc-accent-subtle)] py-px pl-[12ch] pr-3 text-[var(--plc-on-subtle)]">
                      <span class="shrink-0">
                        @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
                      </span>
                      <span class="truncate">{h.section}</span>
                    </div>
                    <For each={h.lines}>{(l) => <Line line={l} />}</For>
                  </div>
                )}
              </For>
              <Show when={props.diff?.truncated}>
                <p class="px-3 pb-1 pt-2 font-sans text-[12px] text-[var(--plc-warning)]" data-diff-truncated>
                  The diff is clipped here. Open the code to read the rest.
                </p>
              </Show>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
