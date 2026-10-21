import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { ChevronDown, File, Folder, History, RefreshCw } from "lucide-solid";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { OptionRow, PopoverPanel, PopoverSectionTitle } from "../components/ui/PopoverPanel";
import { TextInput } from "../components/ui/TextInput";
import { recentPaths } from "../utils/recentPaths";

type Suggestion = { name: string; path: string; type: "file" | "folder" };

async function suggest(path: string): Promise<Suggestion[]> {
  const res = await fetch(`/api/files/suggest?path=${encodeURIComponent(path)}`);
  return res.ok ? (await res.json()).items ?? [] : [];
}

/**
 * The analyzed folder's menu, opened from the chevron beside its name in the
 * location bar: rescan it, type or browse to another folder, or reopen a
 * recent one. Everything about *which codebase* lives here.
 */
export default function FolderMenu(props: {
  path: string;
  summary: string;
  onAnalyze: (path: string) => void;
  onRescan: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  // Suggestions only once the draft differs from the loaded folder; until then the list shows recents.
  const browsing = () => open() && draft().trim() !== props.path;
  const [suggestions] = createResource(() => (browsing() ? draft() : false), suggest);
  const recents = () => recentPaths().filter((p) => p !== props.path);
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    if (open()) setDraft(props.path);
  });

  const run = (path: string) => {
    setOpen(false);
    if (path.trim()) props.onAnalyze(path.trim());
  };

  const pick = (item: Suggestion) => {
    if (item.type === "file") return run(item.path);
    setDraft(item.path.endsWith("/") ? item.path : `${item.path}/`);
    input?.focus();
  };

  return (
    <Popover
      isOpen={open()}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={{ x: 0, y: 6 }}
      trigger={(trigger) => (
        <IconButton
          ref={trigger.ref}
          size="xs"
          label="Switch folder, rescan, or open a recent one"
          aria-haspopup="dialog"
          aria-expanded={open()}
          class={open() ? "bg-[var(--plc-surface-selected)] text-[var(--plc-accent)]" : ""}
          onClick={(e) => trigger.onClick(e)}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </IconButton>
      )}
    >
      <PopoverPanel class="w-[34rem] max-w-[92vw] p-0">
        <div class="flex items-start gap-3 px-3 pb-2.5 pt-3">
          <div class="min-w-0 flex-1">
            <div class="break-all font-mono text-[12px] leading-[18px] text-[var(--plc-on-surface)]">{props.path}</div>
            <div class="mt-0.5 text-[12px] text-[var(--plc-on-subtle)]">{props.summary}</div>
          </div>
          <Button
            variant="default"
            size="sm"
            class="shrink-0 gap-1.5"
            title="Scan again, ignoring the saved analysis"
            onClick={() => {
              setOpen(false);
              props.onRescan();
            }}
          >
            <RefreshCw size={13} aria-hidden="true" />
            Rescan
          </Button>
        </div>

        <form
          class="flex gap-2 border-t border-[var(--plc-border)] px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(draft());
          }}
        >
          <TextInput
            ref={(el) => {
              input = el;
              // The popover shows its content after placing it; focus once it is visible.
              requestAnimationFrame(() => {
                el.focus();
                el.select();
              });
            }}
            type="text"
            aria-label="Folder to analyze"
            placeholder="/path/to/codebase"
            class="font-mono text-[12px]"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <Button type="submit" variant="primary" size="md" disabled={!draft().trim()}>
            Analyze
          </Button>
        </form>

        <div class="max-h-72 overflow-y-auto border-t border-[var(--plc-border)] py-1">
          <Show
            when={browsing()}
            fallback={
              <>
                <PopoverSectionTitle class="mb-0 px-3 pb-1 pt-1.5">Recent folders</PopoverSectionTitle>
                <Show
                  when={recents().length > 0}
                  fallback={<p class="px-3 pb-2 text-[12px] text-[var(--plc-on-subtle)]">Folders you analyze show up here.</p>}
                >
                  <For each={recents()}>
                    {(path) => (
                      <OptionRow class="flex items-center gap-2 rounded-none px-3 py-1.5" onClick={() => run(path)}>
                        <History size={13} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
                        <span class="min-w-0 truncate font-mono text-[12px]" title={path}>{path}</span>
                      </OptionRow>
                    )}
                  </For>
                </Show>
              </>
            }
          >
            <Show
              when={(suggestions() ?? []).length > 0}
              fallback={
                <p class="px-3 py-2 text-[12px] text-[var(--plc-on-subtle)]">
                  {suggestions.loading ? "Looking…" : "No matches. Press Enter to analyze this path."}
                </p>
              }
            >
              <For each={suggestions()}>
                {(item) => (
                  <OptionRow class="flex items-center gap-2 rounded-none px-3 py-1.5" onClick={() => pick(item)}>
                    <span class="flex shrink-0 text-[var(--plc-on-subtle)]">
                      {item.type === "folder" ? <Folder size={13} aria-hidden="true" /> : <File size={13} aria-hidden="true" />}
                    </span>
                    <span class="min-w-0 truncate text-[13px]">{item.name}</span>
                  </OptionRow>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </PopoverPanel>
    </Popover>
  );
}
