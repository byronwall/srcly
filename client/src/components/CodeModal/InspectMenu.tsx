import { For, Show, onCleanup, onMount } from "solid-js";
import type { InspectAction, ValueFlowInspector } from "../../investigation/valueFlowInspector";

const MENU_ITEMS: { action: InspectAction; label: string; hint: string; title: string }[] = [
  { action: "ledger", label: "Inspect value flow", hint: "", title: "The value's history as a ledger in the rail" },
  { action: "forward", label: "Trace where it goes", hint: "graph", title: "Open the graph anchored here, forward: render slots, effects, returns" },
  { action: "backward", label: "Trace where it comes from", hint: "graph", title: "Open the graph anchored here, backward: the origins it is proven to come from" },
];

/**
 * Right-click in the code viewer: "Inspect value flow" at the caret, then a
 * pick among the expressions that cover it when there is more than one.
 */
export function InspectMenu(props: { inspector: ValueFlowInspector }) {
  const close = () => props.inspector.closeMenus();
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (props.inspector.menu() || props.inspector.picker())) {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-inspect-menu]")) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    });
  });
  const panel = "fixed z-[60] min-w-[14rem] max-w-[28rem] rounded-md border border-[var(--plc-border)] bg-[var(--plc-surface)] py-1 text-[12px] shadow-[var(--plc-dialog-shadow)]";
  return (
    <>
      <Show when={props.inspector.menu()}>
        {(m) => (
          <div data-inspect-menu role="menu" class={panel} style={{ left: `${m().x}px`, top: `${m().y}px` }}>
            <For each={MENU_ITEMS}>
              {(item, i) => (
                <button
                  type="button"
                  role="menuitem"
                  class="flex w-full items-baseline gap-3 px-3 py-1.5 text-left hover:bg-[var(--plc-surface-hover)]"
                  classList={{ "border-t border-[var(--plc-divider)]": i() === 1 }}
                  title={item.title}
                  ref={(el) => {
                    if (i() === 0) queueMicrotask(() => el.focus());
                  }}
                  onClick={() => void props.inspector.inspect(item.action)}
                >
                  <span class="font-medium text-[var(--plc-on-surface)]">{item.label}</span>
                  <span class="plc-data-sm ml-auto text-[var(--plc-on-subtle)]">
                    {i() === 0 ? `L${m().line}:${m().column}` : item.hint}
                  </span>
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
      <Show when={props.inspector.picker()}>
        {(p) => (
          <div data-inspect-menu role="listbox" aria-label="Pick an expression" class={panel} style={{ left: `${p().x}px`, top: `${p().y}px` }}>
            <div class="px-3 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">
              {p().loading ? "Finding the expression…" : p().candidates.length ? (p().action === "ledger" ? "Which expression?" : "Trace which expression?") : "Nothing to inspect"}
            </div>
            <Show when={p().message}>
              <p class="px-3 pb-1.5 text-[11.5px] text-[var(--plc-on-muted)]">{p().message}</p>
            </Show>
            <For each={p().candidates}>
              {(c) => (
                <button
                  type="button"
                  role="option"
                  class="flex w-full items-baseline gap-3 px-3 py-1 text-left hover:bg-[var(--plc-surface-hover)]"
                  title={c.evidence ? "The engine has evidence for this expression" : "No evidence element at exactly this expression"}
                  onClick={() => void props.inspector.run(c)}
                >
                  <code class="min-w-0 truncate font-mono text-[12px] text-[var(--plc-on-surface)]">{c.text}</code>
                  <span class="ml-auto shrink-0 text-[10.5px] text-[var(--plc-on-subtle)]">{kindWord(c.kind)}</span>
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </>
  );
}

function kindWord(kind: string): string {
  const words: Record<string, string> = {
    PropertyAccessExpression: "property read",
    Identifier: "name",
    CallExpression: "call",
    BinaryExpression: "fallback",
    ConditionalExpression: "conditional",
    NonNullExpression: "assertion",
    ParenthesizedExpression: "group",
    JsxExpression: "JSX expression",
    ElementAccessExpression: "index read",
  };
  return words[kind] ?? kind;
}
