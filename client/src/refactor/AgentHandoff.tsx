import { createEffect, createSignal, For, Show } from "solid-js";
import { Copy, RefreshCw } from "lucide-solid";
import { Button } from "../components/ui/Button";
import { request, type Run, type RunSummary } from "./api";
import { operationName, shellQuote, statusName } from "./presentation";

export default function AgentHandoff(props: { root: string; source: string; run?: Run; busy: boolean; onOpen: (id: string) => void; onCopy: (text: string, message: string) => void }) {
  const [recent, setRecent] = createSignal<RunSummary[]>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [runId, setRunId] = createSignal("");
  let version = 0;
  async function refresh() {
    const current = ++version, root = props.root;
    setLoading(true); setError("");
    try { const result = await request<RunSummary[]>(`/runs?${new URLSearchParams({ path: root })}`); if (current === version && root === props.root) setRecent(result); }
    catch (reason) { if (current === version) setError(String(reason)); }
    finally { if (current === version) setLoading(false); }
  }
  createEffect(() => { void props.root; void refresh(); });
  const brief = () => `Help me refine and validate this srcly refactoring plan.\nProject: ${props.root}\n\nUse deterministic DSL operations. Read the supported grammar with:\nsrcly refactor catalog\n\nSave the plan as plan.srcly, then run:\nsrcly refactor parse plan.srcly\nsrcly refactor preview plan.srcly --path ${shellQuote(props.root)}\n\nFix reported DSL errors or add suggested dependency steps and preview again. Do not apply until asked. Return the run id and reviewPath so I can review the exact codemod in srcly on this machine.\n\nCurrent plan:\n${props.source}${props.run ? `\nCurrent run: ${props.run.id}\nStatus: ${props.run.status}\nWorktree: ${props.run.worktree}\nDiagnostics:\n${JSON.stringify([...props.run.diagnostics ?? [], ...props.run.typeDiagnostics ?? []], null, 2)}\n` : ""}`;
  return <div class="rf-agent" data-refactor-agent>
    <div class="rf-section-intro"><h3>One plan. Agent or app.</h3><p>Give an agent the current plan and compiler feedback. Its preview appears here, ready for your review.</p><Button data-refactor-copy-brief onClick={() => props.onCopy(brief(), "Agent brief copied")}><Copy size={14} />Copy agent brief</Button></div>
    <div class="rf-agent-command"><span class="rf-muted">Agent validates a saved plan</span><code>srcly refactor preview plan.srcly --path {shellQuote(props.root)}</code></div>
    <form class="rf-open-run" onSubmit={event => { event.preventDefault(); props.onOpen(runId().trim()); }}><label>Open a run from your agent<input data-refactor-run-id placeholder="Paste a run ID or review link" value={runId()} onInput={event => setRunId(event.currentTarget.value)} /></label><Button type="submit" data-refactor-open-run disabled={!runId().trim() || props.busy}>Open run</Button></form>
    <div class="rf-panel-title"><span>Recent runs for this project</span><Button data-refactor-refresh-runs disabled={loading()} onClick={() => void refresh()}><RefreshCw size={13} />Refresh</Button></div>
    <Show when={error()}><p role="alert" class="rf-error">{error()}</p></Show>
    <div class="rf-recent" aria-busy={loading()}><For each={recent()}>{item => <button data-refactor-recent={item.id} disabled={props.busy} onClick={() => props.onOpen(item.id)}><div><strong>{item.stepCount} {item.stepCount === 1 ? "step" : "steps"} · {statusName(item.status)}</strong><code title={item.label}>{operationName(item.operation)} · {item.label}</code></div><span>{item.applied} applied<br /><time datetime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span></button>}</For><Show when={!recent().length}><p class="rf-muted p-4">{loading() ? "Reading saved runs…" : "No runs yet. Preview in the app or CLI, then refresh. Both must use the same machine and srcly cache."}</p></Show></div>
    <Show when={props.run}>{run => <section class="rf-run-details"><h3>Current run</h3><code>{run().id}</code><p class="rf-muted">Changes are applied in this isolated worktree:</p><code data-refactor-worktree>{run().worktree}</code><div class="rf-actions"><Button onClick={() => props.onCopy(run().worktree, "Worktree path copied")}>Copy path</Button><Button data-refactor-copy-link onClick={() => props.onCopy(new URL(run().reviewPath, window.location.origin).href, "Review link copied")}>Copy review link</Button><a href={`/api/refactor/runs/${run().id}/codemod`} download="codemod.json">Download codemod</a><Button data-refactor-reload-run disabled={props.busy} onClick={() => props.onOpen(run().id)}>Reload run</Button></div></section>}</Show>
  </div>;
}
