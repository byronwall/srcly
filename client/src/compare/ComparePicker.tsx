import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  Cloud,
  CloudDownload,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  GitPullRequestDraft,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-solid";
import { createEffect, createMemo, createResource, createSignal, For, Match, on, Show, Switch, type JSX } from "solid-js";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/classes";
import { IconButton } from "../components/ui/IconButton";
import { TextInput } from "../components/ui/TextInput";
import {
  DEFAULT_BASE,
  DEFAULT_HEAD,
  fetchSource,
  type BranchSource,
  type PrSource,
  type SourceKind,
  type WorktreeSource,
} from "./api";
import {
  branchFields,
  matches,
  pickBranch,
  pickPr,
  pickWorktree,
  prFields,
  prNumberOf,
  refText,
  shortAgo,
  tildePath,
  worktreeFields,
  type Pick,
} from "./pickerModel";
import type { ComparePayload } from "./types";

type Tab = SourceKind | "advanced";
const TABS: { id: Tab; label: string }[] = [
  { id: "prs", label: "PRs" },
  { id: "worktrees", label: "Worktrees" },
  { id: "branches", label: "Branches" },
  { id: "advanced", label: "Advanced" },
];

/** One section's state: still loading, loaded, or unavailable with a reason. */
type Section<T> = { loading: boolean; reason: string | null; items: T[] };

function section<T>(res: { loading: boolean; error?: unknown; latest?: { available: boolean; reason: string | null; items: T[] } }): Section<T> {
  const data = res.latest;
  if (res.error) return { loading: false, reason: String((res.error as Error)?.message ?? res.error), items: [] };
  if (!data) return { loading: true, reason: null, items: [] };
  return { loading: res.loading && !data.items.length, reason: data.available ? null : data.reason, items: data.items };
}

/**
 * The compare input: one trigger that opens a picker over your open PRs,
 * live worktrees and branches. Each source loads on its own, so git sources
 * show at once and PRs fill in when `gh` answers (or say why they can't).
 * Advanced keeps the free-text base/head fields.
 */
export function ComparePicker(props: {
  base: string;
  head: string;
  busy: boolean;
  payload: ComparePayload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompare: (base: string, head: string) => void;
}) {
  const [tab, setTab] = createSignal<Tab>("prs");
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const [allPrs, setAllPrs] = createSignal(false);
  // Sources load the first time the picker opens, then stay for the session.
  const [started, setStarted] = createSignal(false);
  createEffect(() => props.open && setStarted(true));
  const [refresh, setRefresh] = createSignal<Record<SourceKind, number>>({ prs: 0, worktrees: 0, branches: 0 });
  const bump = (kind: SourceKind) => setRefresh((r) => ({ ...r, [kind]: r[kind] + 1 }));

  const [prs] = createResource(
    () => started() && { all: allPrs(), n: refresh().prs },
    (k) => fetchSource("prs", { all: k.all, refresh: k.n > 0 })
  );
  const [worktrees] = createResource(
    () => started() && { n: refresh().worktrees },
    () => fetchSource("worktrees")
  );
  const [branches] = createResource(
    () => started() && { n: refresh().branches },
    () => fetchSource("branches")
  );

  const prSection = () => section<PrSource>(prs);
  const worktreeSection = () => section<WorktreeSource>(worktrees);
  const branchSection = () => section<BranchSource>(branches);

  const filtered = createMemo(() => {
    const q = query();
    return {
      prs: prSection().items.filter((p) => matches(q, prFields(p))),
      worktrees: worktreeSection().items.filter((w) => matches(q, worktreeFields(w))),
      branches: branchSection().items.filter((b) => matches(q, branchFields(b))),
    };
  });

  type Row = { key: string; pick: Pick; render: () => JSX.Element };
  const rows = createMemo<Row[]>(() => {
    const f = filtered();
    switch (tab()) {
      case "prs":
        return f.prs.map((p) => ({ key: `pr${p.number}`, pick: pickPr(p), render: () => <PrRow pr={p} /> }));
      case "worktrees":
        return f.worktrees.map((w) => ({ key: w.path, pick: pickWorktree(w), render: () => <WorktreeRow wt={w} /> }));
      case "branches":
        return f.branches.map((b) => ({ key: b.name, pick: pickBranch(b), render: () => <BranchRow branch={b} /> }));
      default:
        return [];
    }
  });
  createEffect(on([tab, query], () => setActive(0)));

  const choose = (pick: Pick) => {
    props.onOpenChange(false);
    props.onCompare(pick.base, pick.head);
  };

  let listEl: HTMLDivElement | undefined;
  const move = (delta: number) => {
    const n = rows().length;
    if (!n) return;
    const next = (active() + delta + n) % n;
    setActive(next);
    listEl?.querySelector<HTMLElement>(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && tab() !== "advanced") {
      e.preventDefault();
      const row = rows()[active()];
      if (row) choose(row.pick);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = TABS.findIndex((t) => t.id === tab());
      setTab(TABS[(i + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length].id);
    }
  };

  const count = (id: Tab): string => {
    if (id === "advanced") return "";
    const s = id === "prs" ? prSection() : id === "worktrees" ? worktreeSection() : branchSection();
    if (s.loading) return "…";
    if (s.reason) return "–";
    return String(filtered()[id].length);
  };
  const current = (pick: Pick) => pick.base === props.base && pick.head === props.head;

  return (
    <Popover
      isOpen={props.open}
      onOpenChange={props.onOpenChange}
      trigger={(t) => (
        <button
          ref={t.ref}
          type="button"
          onClick={t.onClick}
          aria-haspopup="dialog"
          aria-expanded={t.isOpen}
          class={cx(
            "flex h-7 w-[440px] min-w-0 items-center gap-2 rounded-md border px-2 text-left text-[13px] transition-colors duration-150",
            t.isOpen
              ? "border-[var(--plc-border-focus)] bg-[var(--plc-surface)]"
              : "border-[var(--plc-border-strong)] bg-[var(--plc-surface)] hover:bg-[var(--plc-surface-hover)]"
          )}
        >
          <TriggerLabel base={props.base} head={props.head} payload={props.payload} />
          <ChevronDown size={13} class="ml-auto shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        </button>
      )}
    >
      <div
        role="dialog"
        aria-label="Choose what to compare"
        class="plc-floating flex w-[760px] flex-col overflow-hidden rounded-lg border text-[13px]"
        onKeyDown={onKeyDown}
      >
        <div class="flex items-center gap-2 border-b border-[var(--plc-border)] px-3 py-2">
          <Search size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
          <input
            ref={(el) => requestAnimationFrame(() => el.focus())}
            class="h-6 min-w-0 flex-1 bg-transparent text-[13px] text-[var(--plc-on-surface)] outline-none placeholder:text-[var(--plc-on-disabled)]"
            // Inline: the global unlayered :focus-visible outline beats layered utilities.
            style={{ outline: "none" }}
            placeholder="Search PRs, worktrees and branches by number, title, branch or path"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search"
          />
        </div>
        <div class="flex h-9 items-end gap-1 border-b border-[var(--plc-border)] px-2" role="tablist">
          <For each={TABS}>
            {(t) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab() === t.id}
                class={cx(
                  "-mb-px flex h-8 items-center gap-1.5 border-b-2 px-2.5 text-[13px] transition-colors duration-150",
                  tab() === t.id
                    ? "border-[var(--plc-accent)] font-semibold text-[var(--plc-on-surface)]"
                    : "border-transparent text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]"
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span class="plc-data-sm inline-block min-w-[2ch] text-left font-normal text-[var(--plc-on-subtle)]">
                  {count(t.id)}
                </span>
              </button>
            )}
          </For>
          <div class="flex-1" />
          <div class="flex h-8 items-center gap-1">
            <Show when={tab() === "prs"}>
              <Segmented
                value={allPrs() ? "all" : "mine"}
                options={[
                  { id: "mine", label: "Mine" },
                  { id: "all", label: "All open" },
                ]}
                onChange={(v) => setAllPrs(v === "all")}
              />
            </Show>
            <Show when={tab() !== "advanced"}>
              <IconButton label="Reload this list" size="xs" onClick={() => bump(tab() as SourceKind)}>
                <RefreshCw size={12} aria-hidden="true" />
              </IconButton>
            </Show>
          </div>
        </div>

        <div ref={listEl} class="h-[440px] overflow-y-auto py-1" role="listbox">
          <Switch>
            <Match when={tab() === "advanced"}>
              <AdvancedForm base={props.base} head={props.head} busy={props.busy} onCompare={(b, h) => choose({ base: b, head: h })} />
            </Match>
            <Match when={tab() !== "advanced"}>
              {(() => {
                const s = () =>
                  tab() === "prs" ? prSection() : tab() === "worktrees" ? worktreeSection() : branchSection();
                return (
                  <Switch>
                    <Match when={s().loading}>
                      <Notice>
                        <LoaderCircle size={14} class="animate-spin" aria-hidden="true" />
                        {tab() === "prs" ? "Asking GitHub for open PRs" : "Reading git"}
                      </Notice>
                    </Match>
                    <Match when={s().reason}>
                      <Notice>
                        <div>
                          <div class="font-semibold text-[var(--plc-on-surface)]">
                            {tab() === "prs" ? "PRs are unavailable" : "Could not list this source"}
                          </div>
                          <div class="mt-1">{s().reason}</div>
                          <Show when={tab() === "prs"}>
                            <div class="mt-1">Worktrees, branches and Advanced still work.</div>
                          </Show>
                          <Button variant="ghost" size="sm" class="mt-2" onClick={() => bump(tab() as SourceKind)}>
                            Try again
                          </Button>
                        </div>
                      </Notice>
                    </Match>
                    <Match when={!rows().length}>
                      <Notice>{query() ? "Nothing matches this search." : tab() === "prs" && !allPrs() ? "You have no open PRs. Try All open." : "Nothing here."}</Notice>
                    </Match>
                    <Match when={rows().length}>
                      <For each={rows()}>
                        {(row, i) => (
                          <button
                            type="button"
                            role="option"
                            data-row={i()}
                            aria-selected={active() === i()}
                            class={cx(
                              "block w-full px-3 py-1.5 text-left transition-colors duration-100",
                              active() === i()
                                ? "bg-[var(--plc-surface-hover)]"
                                : current(row.pick)
                                  ? "bg-[var(--plc-surface-selected)]"
                                  : ""
                            )}
                            aria-current={current(row.pick) || undefined}
                            onMouseMove={() => active() !== i() && setActive(i())}
                            onClick={() => choose(row.pick)}
                          >
                            {row.render()}
                          </button>
                        )}
                      </For>
                    </Match>
                  </Switch>
                );
              })()}
            </Match>
          </Switch>
        </div>
        <div class="plc-data-sm flex h-7 items-center gap-3 border-t border-[var(--plc-border)] px-3 text-[var(--plc-on-subtle)]">
          <span class="shrink-0 whitespace-nowrap">↑↓ move</span>
          <span class="shrink-0 whitespace-nowrap">Enter compare</span>
          <span class="shrink-0 whitespace-nowrap">Tab switch list</span>
          <span class="shrink-0 whitespace-nowrap">Esc close</span>
          <span class="ml-auto min-w-0 truncate" title={hint(tab())}>{hint(tab())}</span>
        </div>
      </div>
    </Popover>
  );
}

function hint(tab: Tab): string {
  switch (tab) {
    case "prs":
      return "PR base (merge-base with its own base branch) → PR head";
    case "worktrees":
      return "its PR's base, else merge-base with the default branch → its HEAD";
    case "branches":
      return "its PR's base, else merge-base with the default branch → branch";
    default:
      return "any git ref, merge-base, auto, WORKTREE or pr:<n>";
  }
}

function TriggerLabel(props: { base: string; head: string; payload: ComparePayload | null }) {
  const pr = () => {
    const n = prNumberOf({ base: props.base, head: props.head });
    const meta = props.payload?.head.pr ?? props.payload?.base.pr;
    return n !== null ? { number: n, title: meta?.number === n ? meta.title : "" } : null;
  };
  return (
    <Show
      when={pr()}
      fallback={
        <span class="flex min-w-0 items-center gap-1.5">
          <GitBranch size={13} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
          <span class="plc-data-sm truncate">{refText(props.base)}</span>
          <ArrowRight size={12} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
          <span class="plc-data-sm truncate">{refText(props.head)}</span>
        </span>
      }
    >
      {(p) => (
        <span class="flex min-w-0 items-center gap-1.5">
          <GitPullRequest size={13} class="shrink-0 text-[var(--plc-success)]" aria-hidden="true" />
          <span class="plc-data-sm shrink-0 text-[var(--plc-on-muted)]">#{p().number}</span>
          <span class="truncate">{p().title}</span>
        </span>
      )}
    </Show>
  );
}

function Notice(props: { children: JSX.Element }) {
  return <div class="flex items-start gap-2 px-4 py-6 text-[13px] text-[var(--plc-on-muted)]">{props.children}</div>;
}

function Segmented(props: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div class="flex rounded-md bg-[var(--plc-surface-muted)] p-0.5">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            aria-pressed={props.value === o.id}
            class={cx(
              "h-6 rounded px-2 text-[12px] transition-colors duration-150",
              props.value === o.id
                ? "bg-[var(--plc-surface)] font-semibold text-[var(--plc-on-surface)] shadow-sm"
                : "text-[var(--plc-on-muted)] hover:text-[var(--plc-on-surface)]"
            )}
            onClick={() => props.onChange(o.id)}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Row layout shared by every source: status icon rail, two text lines, right-aligned meta. */
function RowShell(props: { icon: JSX.Element; title: JSX.Element; detail: JSX.Element; meta: JSX.Element }) {
  return (
    <div class="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2.5">
      <div class="pt-[3px]">{props.icon}</div>
      <div class="min-w-0">
        <div class="text-[13px] leading-5 text-[var(--plc-on-surface)]">{props.title}</div>
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] leading-[18px] text-[var(--plc-on-muted)]">{props.detail}</div>
      </div>
      <div class="plc-data-sm flex items-center gap-2 pt-[2px] text-[var(--plc-on-subtle)]">{props.meta}</div>
    </div>
  );
}

const REVIEW: Record<string, { text: string; color: string }> = {
  APPROVED: { text: "approved", color: "var(--plc-success)" },
  CHANGES_REQUESTED: { text: "changes requested", color: "var(--plc-error)" },
  REVIEW_REQUIRED: { text: "review required", color: "var(--plc-on-muted)" },
};

function Checks(props: { state: PrSource["checks"] }) {
  return (
    <span class="inline-flex w-[14px] justify-center" title={props.state ? `Checks: ${props.state}` : "No checks"}>
      <Switch>
        <Match when={props.state === "pass"}>
          <CircleCheck size={13} class="text-[var(--plc-success)]" aria-label="Checks pass" />
        </Match>
        <Match when={props.state === "fail"}>
          <CircleX size={13} class="text-[var(--plc-error)]" aria-label="Checks fail" />
        </Match>
        <Match when={props.state === "pending"}>
          <CircleDashed size={13} class="text-[var(--plc-warning)]" aria-label="Checks pending" />
        </Match>
      </Switch>
    </span>
  );
}

function PrRow(props: { pr: PrSource }) {
  const pr = props.pr;
  return (
    <RowShell
      icon={
        pr.isDraft ? (
          <GitPullRequestDraft size={14} class="text-[var(--plc-on-subtle)]" aria-label="Draft" />
        ) : (
          <GitPullRequest size={14} class="text-[var(--plc-success)]" aria-label="Open" />
        )
      }
      title={
        <>
          <span class="plc-data-sm mr-1.5 text-[var(--plc-on-muted)]">#{pr.number}</span>
          {pr.title}
        </>
      }
      detail={
        <>
          <span class="plc-data-sm whitespace-nowrap">
            {pr.headRefName} <span class="text-[var(--plc-on-subtle)]">→</span> {pr.baseRefName}
          </span>
          <span>{pr.author}</span>
          <Show when={pr.isDraft}>
            <span>draft</span>
          </Show>
          <Show when={pr.reviewDecision && REVIEW[pr.reviewDecision]}>
            {(r) => <span style={{ color: r().color }}>{r().text}</span>}
          </Show>
          <Show when={pr.changedFiles !== null}>
            <span>{pr.changedFiles} files</span>
          </Show>
          <Show when={pr.worktree}>
            <span class="inline-flex items-center gap-1" title={pr.worktree!}>
              <FolderGit2 size={12} aria-hidden="true" />
              worktree
            </span>
          </Show>
          <Show when={!pr.local}>
            <span class="inline-flex items-center gap-1" title="The head commit isn't local; comparing fetches it (objects only)">
              <CloudDownload size={12} aria-hidden="true" />
              needs fetch
            </span>
          </Show>
        </>
      }
      meta={
        <>
          <Checks state={pr.checks} />
          <span class="w-[3ch] text-right">{shortAgo(pr.updatedAt)}</span>
        </>
      }
    />
  );
}

function WorktreeRow(props: { wt: WorktreeSource }) {
  const w = props.wt;
  return (
    <RowShell
      icon={<FolderGit2 size={14} class="text-[var(--plc-on-subtle)]" aria-hidden="true" />}
      title={
        <>
          {w.branch ?? <span class="plc-data-sm">detached {w.sha.slice(0, 7)}</span>}
          <Show when={w.current}>
            <span class="ml-2 text-[12px] text-[var(--plc-accent)]">this repo · working tree</span>
          </Show>
          <span class="ml-2 text-[12px] text-[var(--plc-on-subtle)]">{w.subject}</span>
        </>
      }
      detail={<span class="plc-data-sm break-all">{tildePath(w.path)}</span>}
      meta={<span class="w-[3ch] text-right">{shortAgo(w.date)}</span>}
    />
  );
}

function BranchRow(props: { branch: BranchSource }) {
  const b = props.branch;
  return (
    <RowShell
      icon={
        b.remote ? (
          <Cloud size={14} class="text-[var(--plc-on-subtle)]" aria-label="Remote branch" />
        ) : (
          <GitBranch size={14} class="text-[var(--plc-on-subtle)]" aria-label="Local branch" />
        )
      }
      title={
        <>
          {b.name}
          <Show when={b.pushed}>
            <span class="ml-2 inline-flex items-center gap-1 text-[12px] text-[var(--plc-on-muted)]" title={`Same commit as ${b.upstream ?? "its remote branch"}`}>
              <Cloud size={12} aria-hidden="true" />
              pushed
            </span>
          </Show>
          <Show when={b.worktree}>
            <span class="ml-2 inline-flex items-center gap-1 text-[12px] text-[var(--plc-on-muted)]" title={b.worktree!}>
              <FolderGit2 size={12} aria-hidden="true" />
              worktree
            </span>
          </Show>
        </>
      }
      detail={<span>{b.subject}</span>}
      meta={
        <>
          <Show when={b.ahead !== null}>
            <span class="whitespace-nowrap" title="Commits ahead of / behind the default branch">
              <span class="text-[var(--plc-success)]">↑{b.ahead}</span>{" "}
              <span class="text-[var(--plc-on-muted)]">↓{b.behind}</span>
            </span>
          </Show>
          <span class="w-[3ch] text-right">{shortAgo(b.date)}</span>
        </>
      }
    />
  );
}

/** Today's free-text base → head fields, for anything the lists don't cover. */
function AdvancedForm(props: { base: string; head: string; busy: boolean; onCompare: (base: string, head: string) => void }) {
  const [base, setBase] = createSignal(props.base);
  const [head, setHead] = createSignal(props.head);
  const submit = (e: Event) => {
    e.preventDefault();
    props.onCompare(base().trim() || DEFAULT_BASE, head().trim() || DEFAULT_HEAD);
  };
  return (
    <form class="px-4 py-3" onSubmit={submit}>
      <div class="flex items-center gap-1.5">
        <TextInput
          size="sm"
          class="plc-data-sm w-60"
          aria-label="Base ref"
          placeholder={DEFAULT_BASE}
          value={base()}
          onInput={(e) => setBase(e.currentTarget.value)}
        />
        <ArrowRight size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
        <TextInput
          size="sm"
          class="plc-data-sm w-60"
          aria-label="Head ref"
          placeholder={DEFAULT_HEAD}
          value={head()}
          onInput={(e) => setHead(e.currentTarget.value)}
        />
        <IconButton
          label="Swap base and head"
          disabled={head() === DEFAULT_HEAD}
          onClick={() => {
            const b = base();
            setBase(head());
            setHead(b);
          }}
        >
          <ArrowLeftRight size={13} aria-hidden="true" />
        </IconButton>
        <Button type="submit" variant="primary" size="sm" disabled={props.busy}>
          Compare
        </Button>
      </div>
      <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px] text-[var(--plc-on-muted)]">
        <For
          each={[
            ["main, HEAD~3, abc1234", "any branch, tag, commit or git expression"],
            ["merge-base", "merge-base of the default branch and HEAD"],
            ["auto", "base only: the head's open PR base, else its merge-base with the default branch"],
            ["WORKTREE", "head only: the files on disk, including uncommitted edits"],
            ["pr:42", "a GitHub PR; as base, its merge-base with its own base branch; as head, its head commit"],
          ]}
        >
          {([term, text]) => (
            <>
              <dt class="plc-data-sm text-[var(--plc-on-surface)]">{term}</dt>
              <dd>{text}</dd>
            </>
          )}
        </For>
      </dl>
    </form>
  );
}
