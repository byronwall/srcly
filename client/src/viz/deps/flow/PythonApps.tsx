import { For, Show } from "solid-js";
import { Button } from "../../../components/ui/Button";
import { go } from "../../../navigation/store";

/** Open a Python app below a TypeScript root as its own root, still in Data flow mode. */
export function openPythonApp(root: string, app: string) {
  go({ repo: `${root.replace(/\/+$/, "")}/${app}`, at: "", view: "graph", flow: "", anchor: undefined, dir: undefined, open: undefined, field: undefined, dest: undefined });
}

/**
 * A root with a tsconfig is analyzed as TypeScript, so its Python apps are
 * reached by opening their own folder: one button each.
 */
export function PythonApps(props: { root: string; apps: readonly string[] | undefined; class?: string }) {
  return (
    <Show when={props.apps?.length}>
      <div data-python-apps class={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--plc-on-subtle)] ${props.class ?? ""}`}>
        <span>This folder is analyzed as TypeScript. Python {props.apps!.length === 1 ? "app" : "apps"}:</span>
        <For each={props.apps}>
          {(app) => (
            <Button variant="ghost" class="px-2 font-mono text-[12px]" data-python-app={app} onClick={() => openPythonApp(props.root, app)} title={`Open ${app}/ as its own root and draw its data flow`}>
              {app}/
            </Button>
          )}
        </For>
      </div>
    </Show>
  );
}
