import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { ArrowDown, ArrowUp, Check, Download, FileCode, Play, RotateCcw, Workflow } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { download, request, type Graph, type Plan, type Run } from "./api";
import RefactorGraph from "./RefactorGraph";
import "./refactor.css";

const EMPTY: Graph = { files: [], edges: [] };
const INITIAL = 'refactor 1\nproject "tsconfig.json"\n\n# Select a file and add a move, or write your plan here.\n';

export default function RefactorView(props: { rootPath: string }) {
  const [source, setSource] = createSignal(INITIAL);
  const [config, setConfig] = createSignal("tsconfig.json");
  const [plan, setPlan] = createSignal<Plan>();
  const [parseError, setParseError] = createSignal("");
  const [graph, setGraph] = createSignal<Graph>(EMPTY);
  const [selected, setSelected] = createSignal("");
  const [destination, setDestination] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [run, setRun] = createSignal<Run>();
  const [stepIndex, setStepIndex] = createSignal(-1);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");
  const [editor, setEditor] = createSignal(true);
  const key = () => `srcly.refactor:${props.rootPath}`;
  let loadVersion = 0;

  createEffect(() => {
    const root = props.rootPath;
    ++loadVersion;
    const saved = localStorage.getItem(`srcly.refactor:${root}`);
    setSource(saved ?? INITIAL);
    setGraph(EMPTY); setRun(undefined); setPlan(undefined); setSelected(""); setStepIndex(-1);
    const savedRun = localStorage.getItem(`srcly.refactor:${root}:run`);
    if (savedRun) void request<Run>(`/runs/${savedRun}`).then((value) => { if (props.rootPath === root) setRun(value); }).catch(() => {});
  });

  createEffect(() => {
    const draft = source();
    const root = props.rootPath;
    localStorage.setItem(key(), draft);
    setPlan(undefined);
    const timer = setTimeout(() => {
      void request<Plan>("/parse", { path: root, source: draft }).then((value) => {
        if (draft !== source() || root !== props.rootPath) return;
        setPlan(value); setParseError(""); setConfig(value.config);
      }).catch((reason) => { if (draft === source()) setParseError(reason.message); });
    }, 250);
    onCleanup(() => clearTimeout(timer));
  });

  async function loadProject() {
    const version = ++loadVersion;
    setBusy("Reading TypeScript project…"); setError("");
    try {
      const result = await request<{ graph: Graph }>(`/project?${new URLSearchParams({ path: props.rootPath, config: config() })}`);
      if (version === loadVersion) { setGraph(result.graph); if (!selected()) setSelected(result.graph.files[0] ?? ""); }
    } catch (reason) { setError(String(reason)); }
    finally { if (version === loadVersion) setBusy(""); }
  }

  const validRun = () => run()?.source === source() && run()?.sourceRoot === props.rootPath;
  const executable = () => validRun() && ["ready", "running", "complete"].includes(run()!.status);
  const activeStep = () => validRun() ? run()?.steps[stepIndex()] : undefined;
  const activeGraph = () => activeStep()?.graph ?? (validRun() ? run()?.graph : undefined) ?? graph();
  const visibleFiles = createMemo(() => activeGraph().files.filter((file) => file.toLowerCase().includes(search().toLowerCase())));
  const changes = () => activeStep()?.files ?? [];

  function addMove() {
    if (!selected() || !destination()) return;
    let draft = source().trimEnd();
    const existing = Object.entries(plan()?.handles ?? {}).find(([, handle]) => handle.file === selected());
    let handle = existing?.[0];
    if (!handle) {
      handle = `file_${Object.keys(plan()?.handles ?? {}).length + 1}`;
      const lines = draft.split("\n");
      const firstStep = lines.findIndex((line) => line.trim().startsWith("move-file "));
      lines.splice(firstStep < 0 ? lines.length : firstStep, 0, `let ${handle} = file ${JSON.stringify(selected())}`);
      draft = lines.join("\n");
    }
    setSource(`${draft}\nmove-file $${handle} -> ${JSON.stringify(destination())}\n`);
    setDestination("");
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
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(""); }
  }

  return <section class="rf-workbench" data-refactor-view data-refactor-status={busy() ? "busy" : validRun() ? run()!.status : "draft"}>
    <header class="rf-heading">
      <div class="flex items-center gap-2"><Workflow size={17} /><h2>Refactor workbench</h2><span class="rf-badge">TypeScript · prototype</span></div>
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
    <div class="rf-body">
      <aside class="rf-files">
        <div class="rf-panel-title">PROJECT</div>
        <div class="rf-project-form"><label>TypeScript config<input value={config()} data-refactor-config onInput={(event) => setConfig(event.currentTarget.value)} /></label>
          <Button disabled={!!busy()} data-refactor-load onClick={() => { setSource(source().replace(/^project .+$/m, `project ${JSON.stringify(config())}`)); void loadProject(); }}>Load project</Button>
        </div>
        <input aria-label="Filter files" placeholder="Filter files…" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} />
        <div class="rf-file-list"><For each={visibleFiles()}>{(file) => <button classList={{ selected: file === selected() }} data-refactor-file={file} onClick={() => setSelected(file)} title={file}><FileCode size={13} /><span>{file}</span></button>}</For>
          <Show when={!activeGraph().files.length}><p class="rf-muted p-3">Load one tsconfig project to select targets.</p></Show>
        </div>
      </aside>
      <main class="rf-main">
        <div class="rf-panel-title"><span>RELATIONSHIPS</span><span class="rf-muted">{stepIndex() < 0 ? "Before" : `After step ${stepIndex() + 1}`}</span></div>
        <RefactorGraph graph={activeGraph()} selected={selected()} changed={changes().map((file) => file.path)} onSelect={setSelected} />
        <div class="rf-move-form">
          <label>Move file<span class="rf-target">{selected() || "Select a file in the graph or list"}</span></label>
          <label>Destination<input aria-label="Move destination" data-refactor-destination placeholder="src/features/example.ts" value={destination()} onInput={(event) => setDestination(event.currentTarget.value)} /></label>
          <Button disabled={!selected() || !destination() || !!busy()} data-refactor-add onClick={addMove}>Add move</Button>
        </div>
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
