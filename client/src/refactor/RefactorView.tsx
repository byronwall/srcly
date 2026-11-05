import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { ArrowDown, ArrowUp, Check, Code, Download, Pencil, Play, Plus, RotateCcw, Trash2, Workflow } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { download, request, type Graph, type Plan, type Run, type SymbolInfo } from "./api";
import { operationName, statusName, stepTarget } from "./presentation";
import RefactorGraph from "./RefactorGraph";
import SemanticPreview from "./SemanticPreview";
import StepComposer from "./StepComposer";
import AgentHandoff from "./AgentHandoff";
import "./refactor.css";

const EMPTY: Graph = { files: [], edges: [] };
const INITIAL = 'refactor 1\nproject "tsconfig.json"\n';
type Tab = "changes" | "relationships" | "dsl" | "agent";

export default function RefactorView(props: { rootPath: string }) {
  const projectPath = createMemo(() => props.rootPath);
  const [source, setSource] = createSignal(INITIAL);
  const [config, setConfig] = createSignal("tsconfig.json");
  const [language, setLanguage] = createSignal<"typescript" | "python">("typescript");
  const [plan, setPlan] = createSignal<Plan>();
  const [parseError, setParseError] = createSignal("");
  const [graph, setGraph] = createSignal<Graph>(EMPTY);
  const [projectSymbols, setProjectSymbols] = createSignal<SymbolInfo[]>([]);
  const [selected, setSelected] = createSignal("");
  const [run, setRun] = createSignal<Run>();
  const [stepIndex, setStepIndex] = createSignal(-1);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [tab, setTab] = createSignal<Tab>("changes");
  const [composing, setComposing] = createSignal(false);
  const [filePath, setFilePath] = createSignal("");
  const [fileSearch, setFileSearch] = createSignal("");
  const [previousDraft, setPreviousDraft] = createSignal("");
  const [issuesOpen, setIssuesOpen] = createSignal(false);
  const [showPlan, setShowPlan] = createSignal(false);
  let dialog!: HTMLDialogElement;
  let dslEditor: HTMLTextAreaElement | undefined;
  let loadVersion = 0;
  const key = () => `srcly.refactor:${props.rootPath}`;
  const validRun = () => run()?.source === source() && run()?.sourceRoot === props.rootPath;
  const executable = () => validRun() && ["ready", "running", "complete"].includes(run()!.status.replace("-with-errors", ""));
  const remaining = () => executable() && run()!.applied < run()!.steps.length;
  const activeStep = () => validRun() ? run()?.steps[stepIndex()] : undefined;
  const activeGraph = () => activeStep()?.graph ?? (validRun() ? run()?.graph : undefined) ?? graph();
  const changes = () => activeStep()?.files ?? [];
  const visibleChanges = createMemo(() => changes().filter(file => file.path.toLowerCase().includes(fileSearch().toLowerCase())));
  const activeFile = () => visibleChanges().find(file => file.path === filePath()) ?? visibleChanges()[0];
  const typeErrors = () => activeStep()?.diagnostics ?? (validRun() && stepIndex() < 0 ? run()?.baselineDiagnostics ?? [] : []);
  const totalFiles = () => new Set(run()?.steps.flatMap(step => step.files.map(file => file.path)) ?? []).size;

  function rememberDraft() {
    setPreviousDraft(source()); localStorage.setItem(`${key()}:previous`, source());
  }
  function replaceDraft(value: string) { rememberDraft(); setSource(value); setTab("dsl"); }
  function rememberRun(value: Run) {
    setRun(value); localStorage.setItem(`${key()}:run`, value.id);
    const url = new URL(window.location.href); url.searchParams.set("run", value.id); window.history.replaceState(window.history.state, "", url);
  }
  async function openRun(raw: string) {
    let id = raw;
    if (raw.includes("?")) { try { id = new URL(raw, window.location.origin).searchParams.get("run") ?? ""; } catch { id = ""; } }
    if (!/^[a-f0-9]{32}$/.test(id)) { setError("Enter a 32-character run ID or a srcly review link."); return; }
    const root = props.rootPath;
    setBusy("Opening saved run…"); setError("");
    try {
      const result = await request<Run>(`/runs/${id}`);
      if (root !== props.rootPath) return;
      if (result.sourceRoot !== root) throw new Error("This run belongs to another project. Open its review link to switch projects.");
      if (result.source !== source()) rememberDraft();
      setSource(result.source); rememberRun(result); setStepIndex(Math.max(0, result.applied ? result.applied - 1 : result.steps.length - 1)); setTab("changes");
      const url = new URL(window.location.href); url.searchParams.set("run", id); window.history.replaceState(window.history.state, "", url);
    } catch (reason) { if (root === props.rootPath) setError(String(reason)); }
    finally { if (root === props.rootPath) setBusy(""); }
  }
  createEffect(() => {
    const root = projectPath();
    ++loadVersion;
    setSource(localStorage.getItem(`srcly.refactor:${root}`) ?? INITIAL);
    setPreviousDraft(localStorage.getItem(`srcly.refactor:${root}:previous`) ?? "");
    setBusy(""); setError(""); setNotice(""); setGraph(EMPTY); setProjectSymbols([]); setRun(undefined); setPlan(undefined); setSelected(""); setStepIndex(-1);
    const linkedRun = new URLSearchParams(window.location.search).get("run");
    const savedRun = localStorage.getItem(`srcly.refactor:${root}:run`);
    if (linkedRun && linkedRun !== savedRun) void openRun(linkedRun);
    else if (savedRun) void request<Run>(`/runs/${savedRun}`).then(value => {
      if (props.rootPath === root && !run()) { setRun(value); setStepIndex(Math.max(0, value.applied ? value.applied - 1 : value.steps.length - 1)); }
    }).catch(() => {});
  });
  createEffect(() => {
    const draft = source(), root = props.rootPath;
    setLanguage(/^language\s+(?:python|"python"|'python')\s*(?:#.*)?$/m.test(draft) ? "python" : "typescript");
    localStorage.setItem(key(), draft);
    setPlan(undefined); setParseError("");
    const timer = setTimeout(() => {
      void request<Plan>("/parse", { path: root, source: draft }).then(value => {
        if (draft !== source() || root !== props.rootPath) return;
        setPlan(value); setParseError(""); setConfig(value.config); setLanguage(value.language);
      }).catch(reason => { if (draft === source() && root === props.rootPath) setParseError(reason.message === "Add at least one refactoring step." ? "" : reason.message); });
    }, 250);
    onCleanup(() => clearTimeout(timer));
  });
  createEffect(() => { if (composing()) dialog.showModal(); else if (dialog?.open) dialog.close(); });
  async function copy(text: string, message: string) {
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { setError("Clipboard unavailable. Select and copy the text, or download the plan."); }
  }
  async function loadProject() {
    const version = ++loadVersion;
    setBusy("Reading project…"); setError("");
    const draft = source();
    const projectLine = `project ${JSON.stringify(config())}`;
    if (language() === "typescript") setSource(/^project .+$/m.test(draft) ? draft.replace(/^project .+$/m, projectLine) : draft.replace(/^refactor 1/m, `refactor 1\n${projectLine}`));
    try {
      const result = await request<{ graph: Graph; symbols: SymbolInfo[] }>(`/project?${new URLSearchParams({ path: props.rootPath, config: config(), language: language() })}`);
      if (version === loadVersion) { setGraph(result.graph); setProjectSymbols(result.symbols); }
    } catch (reason) { if (version === loadVersion) setError(String(reason)); }
    finally { if (version === loadVersion) setBusy(""); }
  }
  function changeLanguage(value: "typescript" | "python") {
    setLanguage(value); setGraph(EMPTY); setProjectSymbols([]); setSelected("");
    const draft = source().replace(/^language .+\n?/m, "").replace(/^project .+\n?/m, "");
    setSource(draft.replace(/^refactor 1/, `refactor 1\nlanguage ${value}${value === "typescript" ? `\nproject ${JSON.stringify(config())}` : ""}`));
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
    setSource(lines.join("\n")); setStepIndex(index + delta);
  }
  function removeStep(index: number) {
    const step = plan()?.steps[index]; if (!step) return;
    rememberDraft();
    const lines = source().split("\n"); lines.splice(step.line - 1, 1); setSource(lines.join("\n")); setStepIndex(Math.max(0, index - 1));
  }
  function editStep(index: number) {
    const line = plan()?.steps[index]?.line; setTab("dsl"); setShowPlan(false);
    queueMicrotask(() => {
      const start = source().split("\n").slice(0, (line ?? 1) - 1).reduce((total, value) => total + value.length + 1, 0);
      dslEditor?.focus(); dslEditor?.setSelectionRange(start, source().indexOf("\n", start) < 0 ? source().length : source().indexOf("\n", start));
    });
  }
  async function act(mode: "preview" | "next" | "all" | "undo") {
    setBusy(mode === "preview" ? "Simulating and checking every step…" : mode === "undo" ? "Restoring checkpoint…" : "Applying the recorded codemod…"); setError(""); setNotice("");
    const draft = source(), root = props.rootPath;
    try {
      const result = mode === "preview" ? await request<Run>("/preview", { path: root, source: draft }) : await request<Run>(`/runs/${run()!.id}/execute`, { mode });
      if (root !== props.rootPath || draft !== source()) return;
      rememberRun(result); setStepIndex(mode === "preview" ? Math.max(0, result.steps.length - 1) : Math.max(0, result.applied - 1)); setTab("changes"); setIssuesOpen(false);
    } catch (reason) {
      if (root !== props.rootPath) return;
      setError(String(reason));
      if (mode !== "preview" && run() && draft === source()) {
        const current = await request<Run>(`/runs/${run()!.id}`).catch(() => undefined);
        if (current && root === props.rootPath && draft === source()) { rememberRun(current); setStepIndex(Math.min(current.applied, current.steps.length - 1)); }
      }
    } finally { if (root === props.rootPath) setBusy(""); }
  }
  async function importPlan(file?: File) {
    if (!file) return;
    if (file.size > 100_000) { setError("Plans must be under 100 KB."); return; }
    const root = props.rootPath;
    try { const text = await file.text(); if (root === props.rootPath) replaceDraft(text); }
    catch (reason) { setError(String(reason)); }
  }
  const stepSelected = (index: number) => { setStepIndex(index); setFileSearch(""); setShowPlan(false); if (tab() === "agent" || tab() === "dsl") setTab("changes"); };

  return <section class="rf-workbench" data-refactor-view data-refactor-status={busy() ? "busy" : validRun() ? run()!.status : "draft"}>
    <header class="rf-heading"><div class="rf-title"><Workflow size={17} /><h2>Refactor</h2><span class="rf-muted">{language() === "python" ? "Python" : "TypeScript / Solid"}</span></div><div class="rf-actions"><Button data-refactor-agent-tab variant="tab" active={tab() === "agent"} onClick={() => setTab("agent")}>Agent handoff</Button><Button data-refactor-new-step disabled={!!busy() || !!parseError()} onClick={() => setComposing(true)}><Plus size={14} />Add step</Button></div></header>
    <div class="rf-body" data-plan-open={showPlan()}>
      <aside class="rf-plan" aria-label="Refactoring plan">
        <div class="rf-panel-title"><span>Plan · {plan()?.steps.length ?? 0} {plan()?.steps.length === 1 ? "step" : "steps"}</span><Button class="rf-mobile-only" onClick={() => setShowPlan(false)}>Done</Button></div>
        <button class="rf-before" classList={{ selected: stepIndex() < 0 }} data-refactor-before onClick={() => stepSelected(-1)}>Original project</button>
        <div class="rf-step-list"><For each={plan()?.steps ?? []}>{(step, index) => <div class="rf-step" classList={{ selected: stepIndex() === index() }}>
          <button data-refactor-step={index()} aria-current={stepIndex() === index() ? "step" : undefined} onClick={() => stepSelected(index())}><span class="rf-step-number">{validRun() && run()!.applied > index() ? <Check size={13} /> : index() + 1}</span><span class="rf-step-text"><strong>{operationName(step.kind)}</strong><code title={stepTarget(step, plan())}>{stepTarget(step, plan())}</code><Show when={step.to}><code title={step.to}>→ {step.to}</code></Show><small>{validRun() ? run()?.applied && run()!.applied > index() ? "Applied" : statusName(run()?.steps[index()]?.status ?? "Not reached") : "Needs preview"}</small></span></button>
          <div class="rf-step-tools"><Button aria-label={`Edit step ${index() + 1} in DSL`} disabled={!!busy()} onClick={() => editStep(index())}><Pencil size={12} /></Button><Button aria-label={`Move step ${index() + 1} up`} disabled={index() === 0 || !!busy()} onClick={() => reorder(index(), -1)}><ArrowUp size={12} /></Button><Button aria-label={`Move step ${index() + 1} down`} disabled={index() === (plan()?.steps.length ?? 0) - 1 || !!busy()} onClick={() => reorder(index(), 1)}><ArrowDown size={12} /></Button><Button data-refactor-remove={index()} aria-label={`Remove step ${index() + 1}`} disabled={!!busy()} onClick={() => removeStep(index())}><Trash2 size={12} /></Button></div>
        </div>}</For><Show when={!plan()?.steps.length}><p class="rf-muted p-3">Add a step or paste a plan from your agent. Visual edits and DSL stay in sync.</p></Show></div>
        <div class="rf-plan-footer"><Button data-refactor-edit-dsl onClick={() => setTab("dsl")}><Code size={14} />Edit DSL</Button><p class="rf-muted">Ordered steps. Stable handles follow targets through the chain.</p></div>
      </aside>
      <main class="rf-main">
        <div class="rf-mobile-step"><Button data-refactor-show-plan onClick={() => setShowPlan(true)}>Plan</Button><label>Review step<select data-refactor-step-select value={stepIndex()} onChange={event => stepSelected(Number(event.currentTarget.value))}><option value="-1" selected={stepIndex() < 0}>Original project</option><For each={plan()?.steps ?? []}>{(step, index) => <option value={index()} selected={stepIndex() === index()}>{index() + 1}. {operationName(step.kind)}</option>}</For></select></label></div>
        <nav class="rf-tabs" aria-label="Refactoring workspace"><For each={[["changes", "Changes"], ["relationships", "Relationships"], ["dsl", "DSL"]] as const}>{([value, label]) => <button data-refactor-tab={value} aria-pressed={tab() === value} onClick={() => setTab(value)}>{label}<Show when={value === "changes" && validRun()}><span>{changes().length}</span></Show></button>}</For></nav>
        <div class="rf-feedback"><Show when={error()}><p class="rf-error" role="alert">{error()}</p></Show><Show when={parseError()}><p class="rf-error" data-refactor-parse-error role="alert">{parseError()} <button onClick={() => setTab("dsl")}>Open DSL to fix</button></p></Show><Show when={validRun() && run()?.error}><p class="rf-error" role="alert">{run()?.error}</p></Show><Show when={validRun()}><For each={run()?.diagnostics ?? []}>{diagnostic => <For each={diagnostic.suggestions ?? []}>{suggestion => <div class="rf-suggestion"><code>{suggestion}</code><Button disabled={!!busy()} onClick={() => addSuggestion(suggestion, diagnostic.line)}>Add suggested dependency</Button></div>}</For>}</For></Show></div>
        <Show when={tab() === "changes"}>
          <Show when={validRun()} fallback={<div class="rf-empty"><Workflow size={26} /><h3>{plan()?.steps.length ? "Your plan is ready to preview" : run() ? "The plan has changed" : "Make the change clear before making it real"}</h3><p>{plan()?.steps.length ? `${plan()!.steps.length} ordered steps. Preview checks the whole chain and records the exact edits in an isolated worktree.` : "Add a refactoring step, or bring a DSL plan from your agent. Review the changes here, then apply one step or the whole chain."}</p><div class="rf-actions"><Button onClick={() => plan()?.steps.length ? void act("preview") : setComposing(true)} disabled={!!busy() || !!parseError()}>{plan()?.steps.length ? "Preview plan" : "Add the first step"}</Button><Button onClick={() => setTab("dsl")}>Paste a plan</Button></div><Show when={run() && !validRun()}><p class="rf-muted">Your previous run is saved. Open it from Agent handoff.</p></Show></div>}>
            <div class="rf-review-heading"><div><strong>{stepIndex() < 0 ? "Original project" : `Step ${stepIndex() + 1} · ${operationName(activeStep()?.kind ?? "")}`}</strong><span class="rf-muted">{changes().length} changed files{activeStep()?.status === "validated" ? " · validated" : ""}</span></div><Show when={typeErrors().length}><Button data-refactor-issues-toggle onClick={() => setIssuesOpen(!issuesOpen())} aria-expanded={issuesOpen()}>{typeErrors().length} repairs</Button></Show></div>
            <Show when={typeErrors().length}><div class="rf-repair-note"><span>{typeErrors().length} TypeScript diagnostics{run()?.status.includes("with-errors") ? " · intentional type edits can be applied" : ""}</span><button onClick={() => setIssuesOpen(!issuesOpen())}>{issuesOpen() ? "Hide" : "Review repairs"}</button></div><Show when={issuesOpen()}><div class="rf-type-errors" data-refactor-type-errors><ul><For each={typeErrors()}>{diagnostic => <li><code>{diagnostic.file}:{diagnostic.line} · TS{diagnostic.code}</code><p>{diagnostic.message}</p></li>}</For></ul></div></Show></Show>
            <Show when={activeStep()?.ownership || activeStep()?.machine || activeStep()?.checkpoint}><details class="rf-evidence"><summary>Validation evidence{activeStep()?.ownership ? ` · ${activeStep()!.ownership!.provider} → ${activeStep()!.ownership!.hook}` : activeStep()?.machine ? ` · ${activeStep()!.machine!.states.length} states` : ` · ${activeStep()?.checkpoint?.name}`}</summary><SemanticPreview step={activeStep()} /></details></Show>
            <Show when={changes().length} fallback={<div class="rf-empty"><h3>{stepIndex() < 0 ? "Before any changes" : activeStep()?.checkpoint ? "Checkpoint has no code changes" : "No edits recorded for this step"}</h3><p>{stepIndex() < 0 ? "Select a step to review its diff, or open Relationships to inspect the original project." : "Inspect validation evidence or select another step."}</p></div>}>
              <div class="rf-diff-workspace"><aside class="rf-changed-files"><input aria-label="Filter changed files" placeholder="Find a changed file…" value={fileSearch()} onInput={event => setFileSearch(event.currentTarget.value)} /><div class="rf-file-list"><For each={visibleChanges()}>{file => <button data-refactor-change={file.path} classList={{ selected: activeFile()?.path === file.path }} onClick={() => { setFilePath(file.path); setSelected(file.path); }} title={file.path}><span class="rf-file-status" data-status={file.status}>{file.status === "added" ? "+" : file.status === "removed" ? "−" : "M"}</span><span>{file.path}</span></button>}</For><Show when={!visibleChanges().length}><p class="rf-muted p-3">No matching changed files.</p></Show></div></aside><div class="rf-diff-detail" data-refactor-diff><Show when={activeFile()}>{file => <><header><code>{file().path}</code><span class="rf-muted">{file().status}</span></header><pre tabindex="0" aria-label={`Diff for ${file().path}`}><For each={file().diff.split("\n")}>{line => <span classList={{ "rf-added": line.startsWith("+"), "rf-removed": line.startsWith("-"), "rf-hunk": line.startsWith("@@") }}>{line}{"\n"}</span>}</For></pre></>}</Show></div></div>
            </Show>
          </Show>
        </Show>
        <Show when={tab() === "relationships"}><div class="rf-relationships"><div class="rf-review-heading"><strong>{stepIndex() < 0 ? "Original project" : `After step ${stepIndex() + 1}`}</strong><span class="rf-muted">{activeGraph().files.length} files · {activeGraph().edges.length} imports</span></div><RefactorGraph graph={activeGraph()} selected={selected()} changed={changes().map(file => file.path)} onSelect={setSelected} /><label class="rf-graph-select">Inspect file<select aria-label="Inspect relationships for file" value={selected()} onChange={event => setSelected(event.currentTarget.value)}><option value="">Changed files / overview</option><For each={activeGraph().files}>{file => <option value={file}>{file}</option>}</For></select></label><p class="rf-muted p-3">Select a file to inspect its import neighbourhood. Blue borders mark edits at this step.</p><Button class="rf-graph-add" onClick={() => setComposing(true)} disabled={!!busy()}>Add step for this file</Button></div></Show>
        <Show when={tab() === "dsl"}><div class="rf-dsl-panel"><div class="rf-editor-toolbar"><span class="rf-muted">{plan() ? `${plan()!.steps.length} steps · syntax valid` : "Editable plan · checked as you type"}</span><div class="rf-actions"><label class="rf-import">Import .srcly<input type="file" accept=".srcly,.txt" aria-label="Import plan" data-refactor-import onChange={event => { void importPlan(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label><Button data-refactor-export onClick={() => download("plan.srcly", source())}><Download size={13} />Export</Button></div></div><textarea ref={dslEditor} aria-label="Refactoring DSL" data-refactor-dsl spellcheck={false} value={source()} onInput={event => setSource(event.currentTarget.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && plan() && !busy()) { event.preventDefault(); void act("preview"); } }} /><div class="rf-editor-footer"><span class="rf-muted">Draft saved locally · Ctrl / ⌘ Enter to preview</span><Show when={previousDraft()}><Button data-refactor-restore-draft onClick={() => replaceDraft(previousDraft())}>Restore previous draft</Button></Show><a href="/api/refactor/catalog" target="_blank" rel="noreferrer">DSL reference</a></div></div></Show>
        <Show when={tab() === "agent"}><AgentHandoff root={props.rootPath} source={source()} run={validRun() ? run() : undefined} busy={!!busy()} onOpen={id => void openRun(id)} onCopy={(text, message) => void copy(text, message)} /></Show>
      </main>
    </div>
    <footer class="rf-execution"><div class="rf-execution-status" role="status"><strong data-refactor-run-status data-status={validRun() ? run()!.status : "draft"}>{busy() || (validRun() ? statusName(run()!.status) : run() ? "Plan changed · preview again" : "Draft · preview to validate")}</strong><span class="rf-muted">{notice() || (validRun() ? `${run()!.applied} / ${run()!.steps.length} applied · ${totalFiles()} files · isolated worktree` : "The source checkout stays untouched.")}</span></div><div class="rf-actions"><Show when={validRun()}><Button data-refactor-undo disabled={!!busy() || !executable() || !run()!.applied} onClick={() => void act("undo")}><RotateCcw size={13} />Undo</Button></Show><Show when={remaining()} fallback={<Button variant={validRun() && run()?.status.startsWith("complete") ? "default" : "primary"} data-refactor-preview disabled={!!busy() || !plan()} onClick={() => void act("preview")}><Play size={13} />{validRun() ? "Revalidate" : "Preview plan"}</Button>}><Button data-refactor-preview disabled={!!busy() || !plan()} onClick={() => void act("preview")}>Revalidate</Button><Button data-refactor-all disabled={!!busy() || !remaining()} onClick={() => void act("all")}>Run all</Button><Button variant="primary" data-refactor-next disabled={!!busy() || !remaining()} onClick={() => void act("next")}>Apply step {run()!.applied + 1}</Button></Show></div></footer>
    <dialog ref={dialog} class="rf-dialog" aria-labelledby="rf-add-title" onCancel={() => setComposing(false)} onClose={() => setComposing(false)}><Show when={composing()}><StepComposer source={source()} plan={plan()} graph={graph()} symbols={projectSymbols()} language={language()} config={config()} busy={!!busy()} selected={selected()} onConfig={setConfig} onLanguage={changeLanguage} onLoad={() => void loadProject()} onAdd={value => { setSource(value); setComposing(false); setStepIndex(plan()?.steps.length ?? 0); setTab("changes"); }} onClose={() => setComposing(false)} /><Show when={error()}><p role="alert" class="rf-error">{error()}</p></Show></Show></dialog>
  </section>;
}
