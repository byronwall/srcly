import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { ArrowDown, ArrowUp, Check, Download, FileCode, Play, RotateCcw, Workflow } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { download, request, type Graph, type Plan, type Run, type SymbolInfo } from "./api";
import RefactorGraph from "./RefactorGraph";
import SemanticPreview from "./SemanticPreview";
import "./refactor.css";

const EMPTY: Graph = { files: [], edges: [] };
const INITIAL = 'refactor 1\nproject "tsconfig.json"\n\n# Select a file and add a move, or write your plan here.\n';
const OPERATIONS = [
  ["move-file", "Move file"], ["move-symbol", "Move symbol"], ["rename", "Rename symbol / member"],
  ["extract-function", "Extract function"], ["extract-component", "Extract component"],
  ["add-member", "Add type member"], ["update-member", "Update type member"], ["remove-member", "Remove type member"],
  ["add-type", "Add interface / type"], ["update-type", "Update interface / type"], ["remove-type", "Remove interface / type"],
  ["solid-context", "Global state → context + hook"], ["state-machine", "If/else → state machine"],
  ["checkpoint", "Run named test checkpoint"],
];

export default function RefactorView(props: { rootPath: string }) {
  // Scans replace the tree object while retaining its path. Only a different
  // path should discard an in-flight compiler load or reset this draft.
  const projectPath = createMemo(() => props.rootPath);
  const [source, setSource] = createSignal(INITIAL);
  const [config, setConfig] = createSignal("tsconfig.json");
  const [language, setLanguage] = createSignal<"typescript" | "python">("typescript");
  const [plan, setPlan] = createSignal<Plan>();
  const [parseError, setParseError] = createSignal("");
  const [graph, setGraph] = createSignal<Graph>(EMPTY);
  const [selected, setSelected] = createSignal("");
  const [destination, setDestination] = createSignal("");
  const [operation, setOperation] = createSignal("move-file");
  const [symbol, setSymbol] = createSignal("");
  const [snippet, setSnippet] = createSignal("");
  const [reexport, setReexport] = createSignal(false);
  const [provider, setProvider] = createSignal("StateProvider");
  const [hook, setHook] = createSignal("useState");
  const [ownerFile, setOwnerFile] = createSignal("src/App.tsx");
  const [ownerName, setOwnerName] = createSignal("App");
  const [projectSymbols, setProjectSymbols] = createSignal<SymbolInfo[]>([]);
  const [search, setSearch] = createSignal("");
  const [run, setRun] = createSignal<Run>();
  const [stepIndex, setStepIndex] = createSignal(-1);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");
  const [editor, setEditor] = createSignal(true);
  const key = () => `srcly.refactor:${props.rootPath}`;
  let loadVersion = 0;

  createEffect(() => {
    const root = projectPath();
    ++loadVersion;
    const saved = localStorage.getItem(`srcly.refactor:${root}`);
    setSource(saved ?? INITIAL);
    setBusy(""); setError("");
    setGraph(EMPTY); setRun(undefined); setPlan(undefined); setSelected(""); setStepIndex(-1);
    const savedRun = localStorage.getItem(`srcly.refactor:${root}:run`);
    if (savedRun) void request<Run>(`/runs/${savedRun}`).then((value) => { if (props.rootPath === root) setRun(value); }).catch(() => {});
  });

  createEffect(() => {
    const draft = source();
    setLanguage(/^language\s+(?:python|"python"|'python')\s*(?:#.*)?$/m.test(draft) ? "python" : "typescript");
    const root = props.rootPath;
    localStorage.setItem(key(), draft);
    setPlan(undefined);
    const timer = setTimeout(() => {
      void request<Plan>("/parse", { path: root, source: draft }).then((value) => {
        if (draft !== source() || root !== props.rootPath) return;
        setPlan(value); setParseError(""); setConfig(value.config); setLanguage(value.language);
      }).catch((reason) => { if (draft === source()) setParseError(reason.message); });
    }, 250);
    onCleanup(() => clearTimeout(timer));
  });

  async function loadProject() {
    const version = ++loadVersion;
    setBusy("Reading project…"); setError("");
    try {
      const result = await request<{ graph: Graph; symbols: SymbolInfo[] }>(`/project?${new URLSearchParams({ path: props.rootPath, config: config(), language: language() })}`);
      if (version === loadVersion) { setGraph(result.graph); setProjectSymbols(result.symbols); if (!selected()) setSelected(result.graph.files[0] ?? ""); }
    } catch (reason) { setError(String(reason)); }
    finally { if (version === loadVersion) setBusy(""); }
  }

  function changeLanguage(value: "typescript" | "python") {
    setLanguage(value); setOperation("move-file"); setGraph(EMPTY); setProjectSymbols([]); setSelected("");
    let draft = source().replace(/^language .+\n?/m, "").replace(/^project .+\n?/m, "");
    draft = draft.replace(/^refactor 1/, `refactor 1\nlanguage ${value}${value === "typescript" ? `\nproject ${JSON.stringify(config())}` : ""}`);
    setSource(draft);
  }

  const validRun = () => run()?.source === source() && run()?.sourceRoot === props.rootPath;
  const executable = () => validRun() && ["ready", "running", "complete"].includes(run()!.status.replace("-with-errors", ""));
  const activeStep = () => validRun() ? run()?.steps[stepIndex()] : undefined;
  const activeGraph = () => activeStep()?.graph ?? (validRun() ? run()?.graph : undefined) ?? graph();
  const visibleFiles = createMemo(() => activeGraph().files.filter((file) => file.toLowerCase().includes(search().toLowerCase())));
  const changes = () => activeStep()?.files ?? [];
  const symbols = () => (activeStep()?.symbols ?? projectSymbols()).filter((item) => item.file === selected());
  const typeErrors = () => activeStep()?.diagnostics ?? (validRun() && stepIndex() < 0 ? run()?.baselineDiagnostics ?? [] : []);
  const selectionOperation = () => operation().startsWith("extract-");
  const needsSymbol = () => !["move-file", "add-type", "solid-context", "checkpoint"].includes(operation()) && !selectionOperation();
  const destinationLabel = () => operation() === "checkpoint" ? "Check name" : operation().startsWith("move-") || operation() === "solid-context" ? "Destination" : ["add-member", "update-member", "add-type", "update-type"].includes(operation()) ? "Declaration" : operation() === "remove-member" ? "Member name" : "New name";
  const operations = () => OPERATIONS.filter(([name]) => language() === "typescript" || ["move-file", "checkpoint"].includes(name));

  function addMove() {
    if ((!selected() && operation() !== "checkpoint") || (!destination() && operation() !== "remove-type")) return;
    let draft = source().trimEnd();
    if (operation() === "checkpoint") { setSource(`${draft}\ncheckpoint ${JSON.stringify(destination())}\n`); setDestination(""); return; }
    if (operation() === "solid-context") {
      let sequence = 1;
      while (new RegExp(`\\blet owner_${sequence}\\b`).test(draft)) sequence++;
      const lines = draft.split("\n");
      lines.splice((plan()?.steps[0]?.line ?? lines.length + 1) - 1, 0, `let owner_${sequence} = symbol ${JSON.stringify(ownerFile())} ${JSON.stringify(ownerName())}`);
      setSource(`${lines.join("\n")}\nsolid-context ${JSON.stringify(selected())} -> ${JSON.stringify(destination())} provider ${provider()} hook ${hook()} within $owner_${sequence}\n`);
      setDestination(""); return;
    }
    if (operation() === "add-type") { setSource(`${draft}\nadd-type ${JSON.stringify(selected())} ${JSON.stringify(destination())}\n`); setDestination(""); return; }
    const kind = selectionOperation() ? "selection" : needsSymbol() ? "symbol" : "file";
    const existing = Object.entries(plan()?.handles ?? {}).find(([, handle]) => handle.file === selected() && (handle.kind ?? "file") === kind && (kind === "file" || (kind === "symbol" ? handle.name === symbol() : handle.text === snippet())));
    let handle = existing?.[0];
    if (!handle) {
      let sequence = 1;
      while (new RegExp(`\\blet ${kind}_${sequence}\\b`).test(draft)) sequence++;
      handle = `${kind}_${sequence}`;
      const lines = draft.split("\n");
      const firstStep = plan()?.steps[0]?.line ? plan()!.steps[0].line - 1 : lines.length;
      lines.splice(firstStep, 0, `let ${handle} = ${kind} ${JSON.stringify(selected())}${kind === "file" ? "" : ` ${JSON.stringify(kind === "symbol" ? symbol() : snippet())}`}`);
      draft = lines.join("\n");
    }
    const arrow = ["move-file", "move-symbol", "rename", "extract-function", "extract-component", "state-machine"].includes(operation()) ? " ->" : "";
    setSource(`${draft}\n${operation()} $${handle}${arrow}${operation() === "remove-type" ? "" : ` ${JSON.stringify(destination())}`}${operation() === "move-symbol" && reexport() ? " reexport" : ""}\n`);
    setDestination("");
  }

  function addSuggestion(suggestion: string, line: number | null) {
    const [declaration, ...steps] = suggestion.split("\n");
    const lines = source().split("\n");
    lines.splice((line ?? plan()?.steps[0]?.line ?? lines.length + 1) - 1, 0, ...steps);
    lines.splice((plan()?.steps[0]?.line ?? 1) - 1, 0, declaration);
    setSource(lines.join("\n"));
  }

  function reorder(index: number, delta: number) {
    const steps = plan()?.steps;
    if (!steps?.[index + delta]) return;
    const lines = source().split("\n");
    const a = steps[index].line - 1, b = steps[index + delta].line - 1;
    [lines[a], lines[b]] = [lines[b], lines[a]];
    setSource(lines.join("\n"));
  }

  async function act(mode: "preview" | "next" | "all" | "undo") {
    setBusy(mode === "preview" ? "Simulating and checking every step…" : mode === "undo" ? "Restoring checkpoint…" : "Applying the recorded codemod…");
    setError("");
    const draft = source(), root = props.rootPath;
    try {
      const result = mode === "preview" ? await request<Run>("/preview", { path: root, source: draft }) : await request<Run>(`/runs/${run()!.id}/execute`, { mode });
      if (root !== props.rootPath || draft !== source()) return;
      setRun(result); localStorage.setItem(`${key()}:run`, result.id);
      setStepIndex(mode === "preview" ? Math.max(0, result.steps.length - 1) : result.applied - 1);
    } catch (reason) {
      setError(String(reason));
      if (mode !== "preview" && run() && root === props.rootPath && draft === source()) {
        const current = await request<Run>(`/runs/${run()!.id}`).catch(() => undefined);
        if (current && root === props.rootPath && draft === source()) { setRun(current); setStepIndex(Math.min(current.applied, current.steps.length - 1)); }
      }
    }
    finally { setBusy(""); }
  }

  return <section class="rf-workbench" data-refactor-view data-refactor-status={busy() ? "busy" : validRun() ? run()!.status : "draft"}>
    <header class="rf-heading">
      <div class="flex items-center gap-2"><Workflow size={17} /><h2>Refactor workbench</h2><span class="rf-badge">{language() === "python" ? "Python" : "TypeScript"} · prototype</span></div>
      <div class="flex items-center gap-2">
        <Button data-refactor-export onClick={() => download("plan.srcly", source())}><Download size={13} />Plan</Button>
        <Button variant="primary" data-refactor-preview disabled={!!busy() || !plan()} onClick={() => void act("preview")}><Play size={13} />Preview plan</Button>
      </div>
    </header>
    <div class="rf-status" role="status">
      <Show when={busy()} fallback={<Show when={validRun()} fallback="Design a chain, inspect the generated codemod, then apply it in an isolated Git worktree.">
        <span class="rf-badge" data-refactor-run-status>{run()?.status}</span> {run()?.applied} / {run()?.steps.length} steps applied · base {run()?.commit.slice(0, 8)}
      </Show>}>{busy()}</Show>
    </div>
    <Show when={error() || (validRun() && run()?.error)}><div class="rf-error" role="alert">{error() || run()?.error}</div></Show>
    <Show when={validRun()}><For each={run()?.diagnostics ?? []}>{(diagnostic) => <For each={diagnostic.suggestions ?? []}>{(suggestion) => <div class="rf-suggestion"><code>{suggestion}</code><Button onClick={() => addSuggestion(suggestion, diagnostic.line)}>Add suggested dependency</Button></div>}</For>}</For></Show>
    <div class="rf-body">
      <aside class="rf-files">
        <div class="rf-panel-title">PROJECT</div>
        <div class="rf-project-form"><label>Language<select data-refactor-language value={language()} onChange={(event) => changeLanguage(event.currentTarget.value as "typescript" | "python")}><option value="typescript">TypeScript / Solid</option><option value="python">Python modules</option></select></label>
          <Show when={language() === "typescript"}><label>TypeScript config<input value={config()} data-refactor-config onInput={(event) => setConfig(event.currentTarget.value)} /></label></Show>
          <Button disabled={!!busy()} data-refactor-load onClick={() => { setSource(source().replace(/^project .+$/m, `project ${JSON.stringify(config())}`)); void loadProject(); }}>Load project</Button>
        </div>
        <input aria-label="Filter files" placeholder="Filter files…" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
        <div class="rf-file-list"><For each={visibleFiles()}>{(file) => <button classList={{ selected: file === selected() }} data-refactor-file={file} onClick={() => setSelected(file)} title={file}><FileCode size={13} /><span>{file}</span></button>}</For>
          <Show when={!activeGraph().files.length}><p class="rf-muted p-3">Load {language() === "typescript" ? "one tsconfig project" : "a Python import root"} to select targets.</p></Show>
        </div>
      </aside>
      <main class="rf-main">
        <div class="rf-panel-title"><span>RELATIONSHIPS</span><span class="rf-muted">{stepIndex() < 0 ? "Before" : `After step ${stepIndex() + 1}`}</span></div>
        <RefactorGraph graph={activeGraph()} selected={selected()} changed={changes().map((file) => file.path)} onSelect={setSelected} />
        <div class="rf-move-form">
          <label>Operation<select data-refactor-operation aria-label="Refactoring operation" value={operation()} onChange={(event) => { setOperation(event.currentTarget.value); setDestination(""); }}><For each={operations()}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label>
          <Show when={operation() !== "checkpoint"}><label>File<input data-refactor-target aria-label="Refactoring file" value={selected()} placeholder="Select a file or enter a new path" onInput={(event) => setSelected(event.currentTarget.value)} /></label></Show>
          <Show when={needsSymbol()}><label>Symbol / interface member<input data-refactor-symbol aria-label="Symbol" list="refactor-symbols" value={symbol()} placeholder="Props or Props.title" onInput={(event) => setSymbol(event.currentTarget.value)} /><datalist id="refactor-symbols"><For each={symbols()}>{(item) => <option value={item.name}>{item.kind}</option>}</For></datalist></label></Show>
          <Show when={selectionOperation()}><label>Exact source selection<textarea data-refactor-selection aria-label="Exact source selection" value={snippet()} onInput={(event) => setSnippet(event.currentTarget.value)} /></label></Show>
          <Show when={operation() !== "remove-type"}><label>{destinationLabel()}<input aria-label={destinationLabel()} data-refactor-destination placeholder={operation().startsWith("move-") ? "src/features/example.ts" : operation().includes("member") ? "title: string" : "Name or declaration"} value={destination()} onInput={(event) => setDestination(event.currentTarget.value)} /></label></Show>
          <Show when={operation() === "move-symbol"}><label class="rf-compat"><input type="checkbox" checked={reexport()} onChange={(event) => setReexport(event.currentTarget.checked)} />Compatibility re-export</label></Show>
          <Show when={operation() === "solid-context"}>
            <label>Provider<input data-refactor-provider value={provider()} onInput={(event) => setProvider(event.currentTarget.value)} /></label>
            <label>Hook<input data-refactor-hook value={hook()} onInput={(event) => setHook(event.currentTarget.value)} /></label>
            <label>Root file<input data-refactor-owner-file value={ownerFile()} onInput={(event) => setOwnerFile(event.currentTarget.value)} /></label>
            <label>Root component<input data-refactor-owner-name value={ownerName()} onInput={(event) => setOwnerName(event.currentTarget.value)} /></label>
          </Show>
          <Button disabled={(!selected() && operation() !== "checkpoint") || (!destination() && operation() !== "remove-type") || (needsSymbol() && !symbol()) || (selectionOperation() && !snippet()) || !!busy()} data-refactor-add onClick={addMove}>Add step</Button>
        </div>
        <SemanticPreview step={activeStep()} />
        <Show when={typeErrors().length}><details class="rf-type-errors" open data-refactor-type-errors><summary>{typeErrors().length}{" TypeScript diagnostics · type edits may leave these for repair"}</summary><ul><For each={typeErrors()}>{(diagnostic) => <li><code>{diagnostic.file}:{diagnostic.line} · TS{diagnostic.code}</code><p>{diagnostic.message}</p></li>}</For></ul></details></Show>
        <div class="rf-panel-title"><span>CODEMOD DIFF</span><span class="rf-muted">{changes().length} files · {activeStep() ? `step ${stepIndex() + 1}` : "select a previewed step"}</span></div>
        <div class="rf-diffs" data-refactor-diff>
          <Show when={changes().length} fallback={<p class="rf-muted p-4">Preview the plan to inspect exact edits and validation at each step.</p>}>
            <For each={changes()}>{(file) => <details open><summary><span class="rf-badge">{file.status}</span> {file.path}</summary><pre><For each={file.diff.split("\n")}>{(line) => <span classList={{ "rf-added": line.startsWith("+"), "rf-removed": line.startsWith("-"), "rf-hunk": line.startsWith("@@") }}>{line}{"\n"}</span>}</For></pre></details>}</For>
          </Show>
        </div>
      </main>
      <aside class="rf-plan">
        <div class="rf-panel-title"><span>REFACTORING CHAIN</span><span class="rf-badge">{plan()?.steps.length ?? 0} steps</span></div>
        <button class="rf-before" data-refactor-before onClick={() => setStepIndex(-1)}>Original project</button>
        <div class="rf-step-list"><For each={plan()?.steps ?? []}>{(step, index) => <div class="rf-step" classList={{ selected: stepIndex() === index() }}>
          <button data-refactor-step={index()} onClick={() => setStepIndex(index())}><span class="rf-step-number">{validRun() && run()!.applied > index() ? <Check size={13} /> : index() + 1}</span><span><strong>{step.kind}</strong><code>{step.target} → {step.to}</code><small>{validRun() ? run()?.steps[index()]?.status ?? "not reached" : "needs preview"}</small></span></button>
          <div class="rf-step-order"><Button aria-label="Move step up" disabled={index() === 0 || !!busy()} onClick={() => reorder(index(), -1)}><ArrowUp size={12} /></Button><Button aria-label="Move step down" disabled={index() === (plan()?.steps.length ?? 0) - 1 || !!busy()} onClick={() => reorder(index(), 1)}><ArrowDown size={12} /></Button></div>
        </div>}</For></div>
        <div class="rf-panel-title"><button onClick={() => setEditor(!editor())} aria-expanded={editor()}>EDIT DSL</button><Button size="xs" onClick={() => download("plan.srcly", source())}>Export</Button></div>
        <Show when={editor()}><textarea aria-label="Refactoring DSL" data-refactor-dsl spellcheck={false} value={source()} onInput={(event) => setSource(event.currentTarget.value)} /></Show>
        <Show when={parseError()}><p class="rf-muted rf-parse-error" data-refactor-parse-error>{parseError()}</p></Show>
        <div class="rf-execution">
          <p class="rf-muted">Execution replays these edits in its own worktree. The source checkout stays untouched.</p>
          <div class="flex flex-wrap gap-2"><Button variant="primary" data-refactor-next disabled={!!busy() || !executable() || run()!.applied >= run()!.steps.length} onClick={() => void act("next")}>Apply next step</Button><Button data-refactor-all disabled={!!busy() || !executable() || run()!.applied >= run()!.steps.length} onClick={() => void act("all")}>Run all</Button><Button data-refactor-undo disabled={!!busy() || !executable() || !run()!.applied} onClick={() => void act("undo")}><RotateCcw size={12} />Undo</Button></div>
          <Show when={validRun()}><p class="rf-worktree" data-refactor-worktree>{run()?.worktree}</p><a href={`/api/refactor/runs/${run()!.id}/codemod`} download="codemod.json">Download codemod</a></Show>
        </div>
      </aside>
    </div>
  </section>;
}
