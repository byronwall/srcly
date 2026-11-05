import { createMemo, createSignal, For, Show } from "solid-js";
import { FileCode, X } from "lucide-solid";
import { Button } from "../components/ui/Button";
import type { Graph, Plan, SymbolInfo } from "./api";
import { OPERATIONS } from "./presentation";

export default function StepComposer(props: {
  source: string; plan?: Plan; graph: Graph; symbols: SymbolInfo[]; language: "typescript" | "python";
  config: string; busy: boolean; selected: string;
  onConfig: (value: string) => void; onLanguage: (value: "typescript" | "python") => void;
  onLoad: () => void; onAdd: (source: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = createSignal(props.selected);
  const [operation, setOperation] = createSignal("move-file");
  const [destination, setDestination] = createSignal("");
  const [symbol, setSymbol] = createSignal("");
  const [snippet, setSnippet] = createSignal("");
  const [reexport, setReexport] = createSignal(false);
  const [provider, setProvider] = createSignal("StateProvider");
  const [hook, setHook] = createSignal("useState");
  const [ownerFile, setOwnerFile] = createSignal("src/App.tsx");
  const [ownerName, setOwnerName] = createSignal("App");
  const [search, setSearch] = createSignal("");
  const selectionOperation = () => operation().startsWith("extract-");
  const needsSymbol = () => !["move-file", "add-type", "solid-context", "checkpoint"].includes(operation()) && !selectionOperation();
  const destinationLabel = () => operation() === "checkpoint" ? "Check name" : operation().startsWith("move-") || operation() === "solid-context" ? "Destination" : ["add-member", "update-member", "add-type", "update-type"].includes(operation()) ? "Declaration" : operation() === "remove-member" ? "Member name" : "New name";
  const operations = () => OPERATIONS.filter(([name]) => props.language === "typescript" || ["move-file", "checkpoint"].includes(name));
  const files = createMemo(() => props.graph.files.filter(file => file.toLowerCase().includes(search().toLowerCase())));
  const symbols = () => props.symbols.filter(item => item.file === selected());
  function add() {
    let draft = props.source.trimEnd();
    if (operation() === "checkpoint") { props.onAdd(`${draft}\ncheckpoint ${JSON.stringify(destination())}\n`); return; }
    if (operation() === "solid-context") {
      let sequence = 1;
      while (new RegExp(`\\blet owner_${sequence}\\b`).test(draft)) sequence++;
      const lines = draft.split("\n");
      lines.splice((props.plan?.steps[0]?.line ?? lines.length + 1) - 1, 0, `let owner_${sequence} = symbol ${JSON.stringify(ownerFile())} ${JSON.stringify(ownerName())}`);
      props.onAdd(`${lines.join("\n")}\nsolid-context ${JSON.stringify(selected())} -> ${JSON.stringify(destination())} provider ${provider()} hook ${hook()} within $owner_${sequence}\n`); return;
    }
    if (operation() === "add-type") { props.onAdd(`${draft}\nadd-type ${JSON.stringify(selected())} ${JSON.stringify(destination())}\n`); return; }
    const kind = selectionOperation() ? "selection" : needsSymbol() ? "symbol" : "file";
    const existing = Object.entries(props.plan?.handles ?? {}).find(([, handle]) => handle.file === selected() && (handle.kind ?? "file") === kind && (kind === "file" || (kind === "symbol" ? handle.name === symbol() : handle.text === snippet())));
    let handle = existing?.[0];
    if (!handle) {
      let sequence = 1;
      while (new RegExp(`\\blet ${kind}_${sequence}\\b`).test(draft)) sequence++;
      handle = `${kind}_${sequence}`;
      const lines = draft.split("\n");
      lines.splice((props.plan?.steps[0]?.line ?? lines.length + 1) - 1, 0, `let ${handle} = ${kind} ${JSON.stringify(selected())}${kind === "file" ? "" : ` ${JSON.stringify(kind === "symbol" ? symbol() : snippet())}`}`);
      draft = lines.join("\n");
    }
    const arrow = ["move-file", "move-symbol", "rename", "extract-function", "extract-component", "state-machine"].includes(operation()) ? " ->" : "";
    props.onAdd(`${draft}\n${operation()} $${handle}${arrow}${operation() === "remove-type" ? "" : ` ${JSON.stringify(destination())}`}${operation() === "move-symbol" && reexport() ? " reexport" : ""}\n`);
  }
  return <>
    <header class="rf-dialog-heading"><div><h2 id="rf-add-title">Add a refactoring step</h2><p>Choose a target and describe the change. Preview checks the whole chain.</p></div><Button aria-label="Close step editor" onClick={props.onClose}><X size={16} /></Button></header>
    <div class="rf-composer">
      <aside class="rf-target-picker">
        <div class="rf-project-form">
          <label>Language<select data-refactor-language value={props.language} onChange={event => { props.onLanguage(event.currentTarget.value as "typescript" | "python"); setOperation("move-file"); setSelected(""); }}><option value="typescript">TypeScript / Solid</option><option value="python">Python modules</option></select></label>
          <Show when={props.language === "typescript"}><label>TypeScript config<input data-refactor-config value={props.config} onInput={event => props.onConfig(event.currentTarget.value)} /></label></Show>
          <Button data-refactor-load disabled={props.busy} onClick={props.onLoad}>{props.busy ? "Reading project…" : props.graph.files.length ? "Reload targets" : "Load targets"}</Button>
          <input aria-label="Filter files" placeholder="Find a file…" value={search()} onInput={event => setSearch(event.currentTarget.value)} />
        </div>
        <div class="rf-file-list"><For each={files()}>{file => <button data-refactor-file={file} classList={{ selected: selected() === file }} onClick={() => { setSelected(file); setSymbol(""); }} title={file}><FileCode size={13} /><span>{file}</span></button>}</For><Show when={!files().length}><p class="rf-muted p-3">{props.graph.files.length ? "No matching files. Try a shorter path." : "Load targets, or enter a path directly."}</p></Show></div>
      </aside>
      <div class="rf-move-form">
        <label>Operation<select data-refactor-operation value={operation()} onChange={event => { setOperation(event.currentTarget.value); setDestination(""); }}><For each={operations()}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label>
        <Show when={operation() !== "checkpoint"}><label>File<input data-refactor-target value={selected()} placeholder="src/state.ts" onInput={event => setSelected(event.currentTarget.value)} /></label></Show>
        <Show when={needsSymbol()}><label>Symbol / interface member<input data-refactor-symbol list="refactor-symbols" value={symbol()} placeholder="Props or Props.title" onInput={event => setSymbol(event.currentTarget.value)} /><datalist id="refactor-symbols"><For each={symbols()}>{item => <option value={item.name}>{item.kind}</option>}</For></datalist></label></Show>
        <Show when={selectionOperation()}><label>Exact source selection<textarea data-refactor-selection value={snippet()} onInput={event => setSnippet(event.currentTarget.value)} /></label></Show>
        <Show when={operation() !== "remove-type"}><label>{destinationLabel()}<input data-refactor-destination placeholder={operation().startsWith("move-") || operation() === "solid-context" ? "src/features/example.ts" : operation().includes("member") ? "title: string" : "Name or declaration"} value={destination()} onInput={event => setDestination(event.currentTarget.value)} /></label></Show>
        <Show when={operation() === "move-symbol"}><label class="rf-compat"><input type="checkbox" checked={reexport()} onChange={event => setReexport(event.currentTarget.checked)} />Keep a compatibility re-export</label></Show>
        <Show when={operation() === "solid-context"}>
          <div class="rf-field-pair"><label>Provider<input data-refactor-provider value={provider()} onInput={event => setProvider(event.currentTarget.value)} /></label><label>Hook<input data-refactor-hook value={hook()} onInput={event => setHook(event.currentTarget.value)} /></label></div>
          <div class="rf-field-pair"><label>Root file<input data-refactor-owner-file value={ownerFile()} onInput={event => setOwnerFile(event.currentTarget.value)} /></label><label>Root component<input data-refactor-owner-name value={ownerName()} onInput={event => setOwnerName(event.currentTarget.value)} /></label></div>
          <p class="rf-muted">The provider owns state, effects and cleanup. Preview verifies that it covers every consumer.</p>
        </Show>
        <Show when={operation().includes("member") || operation().includes("type")}><p class="rf-muted">Type edits may intentionally introduce TypeScript errors. Preview lists each repair before you apply.</p></Show>
      </div>
    </div>
    <footer class="rf-dialog-footer"><Button onClick={props.onClose}>Cancel</Button><Button variant="primary" data-refactor-add disabled={(!selected() && operation() !== "checkpoint") || (!destination().trim() && operation() !== "remove-type") || (needsSymbol() && !symbol()) || (selectionOperation() && !snippet()) || props.busy} onClick={add}>Add to plan</Button></footer>
  </>;
}
