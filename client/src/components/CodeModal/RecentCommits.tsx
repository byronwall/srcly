import { For, Show, createResource } from "solid-js";

type Commit = { sha: string; short: string; date: string; author: string; subject: string };
type CommitsResponse = { status: "ok" | "na"; reason: string; commits: Commit[] };

async function fetchCommits(path: string): Promise<CommitsResponse> {
  const res = await fetch(`/api/files/commits?path=${encodeURIComponent(path)}&limit=5`);
  if (!res.ok) return { status: "na", reason: `Couldn't read Git history (${res.status})`, commits: [] };
  return (await res.json()) as CommitsResponse;
}

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** The last few commits touching the file: the evidence behind Commits and Churn. */
export function RecentCommits(props: { path: string }) {
  const [data] = createResource(() => props.path, fetchCommits);
  return (
    <section class="mt-4 border-t border-[var(--plc-divider)] pt-2.5" aria-label="Recent commits">
      <h3 class="mb-1.5 pl-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--plc-on-subtle)]">
        Recent commits
      </h3>
      <Show
        when={data()}
        fallback={<p class="pl-1.5 text-[11px] text-[var(--plc-on-disabled)]">Reading Git history…</p>}
      >
        {(res) => (
          <Show
            when={res().status === "ok" && res().commits.length > 0}
            fallback={
              <p class="pl-1.5 text-[11px] text-[var(--plc-on-disabled)]">
                {res().status === "ok" ? "No commits touch this file yet" : `N/A: ${res().reason}`}
              </p>
            }
          >
            <ol class="flex flex-col">
              <For each={res().commits}>
                {(c) => (
                  <li
                    class="rounded px-1.5 py-1 hover:bg-[var(--plc-surface-hover)]"
                    title={`${c.sha}\n${c.author} · ${c.date}\n\n${c.subject}`}
                  >
                    <div class="flex items-baseline gap-2 text-[11px] text-[var(--plc-on-subtle)]">
                      <span class="plc-data-sm text-[var(--plc-on-muted)]">{c.short}</span>
                      <span class="ml-auto shrink-0">{shortDate(c.date)}</span>
                    </div>
                    <div class="truncate text-[12px] text-[var(--plc-on-surface)]">{c.subject}</div>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        )}
      </Show>
    </section>
  );
}
