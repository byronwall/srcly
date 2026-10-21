import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { ChevronDown, File, Folder, History, RefreshCw } from "lucide-solid";
import Popover from "../components/Popover";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { OptionRow, PopoverPanel, PopoverSectionTitle } from "../components/ui/PopoverPanel";
import { TextInput } from "../components/ui/TextInput";
import { recentPaths } from "../utils/recentPaths";

type Suggestion = { name: string; path: string; type: "file" | "folder" };
type Row = { path: string; label: string; icon: "folder" | "file" | "recent" };

async function suggest(path: string): Promise<Suggestion[]> {
  const res = await fetch(`/api/files/suggest?path=${encodeURIComponent(path)}`);
  return res.ok ? (await res.json()).items ?? [] : [];
}

/** A path that wraps only after its slashes, never inside a folder name. */
const SlashWrapped = (props: { path: string }) => (
  <For each={props.path.split(/(?<=\/)/)}>
    {(part) => (
      <>
        <span class="whitespace-nowrap">{part}</span>
        <wbr />
      </>
    )}
  </For>
);

const ICONS = { folder: Folder, file: File, recent: History };

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
  const [active, setActive] = createSignal(-1);
  // Suggestions only once the draft differs from the loaded folder; until then the list shows recents.
  const changed = () => draft().trim() !== props.path;
  const browsing = () => open() && changed();
  const [suggestions] = createResource(() => (browsing() ? draft() : false), suggest);
  const rows = (): Row[] =>
    browsing()
      ? (suggestions() ?? []).map((s) => ({ path: s.path, label: s.name, icon: s.type }))
      : recentPaths()
          .filter((p) => p !== props.path)
          .map((p) => ({ path: p, label: p, icon: "recent" as const }));
  let input: HTMLInputElement | undefined;

  createEffect(() => {
    if (open()) setDraft(props.path);
  });
  // A new list starts with nothing highlighted, so Enter opens what was typed.
  createEffect(() => {
    rows();
    setActive(-1);
  });

  const run = (path: string) => {
    setOpen(false);
    if (path.trim()) props.onAnalyze(path.trim());
  };

  const pick = (row: Row) => {
    if (row.icon !== "folder") return run(row.path);
    setDraft(row.path.endsWith("/") ? row.path : `${row.path}/`);
    input?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = rows().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + count) % count);
    } else if (e.key === "Enter" && active() >= 0) {
      e.preventDefault();
      pick(rows()[active()]);
    }
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
            <div class="font-mono text-[12px] leading-[18px] text-[var(--plc-on-surface)]">
              <SlashWrapped path={props.path} />
            </div>
            <div class="mt-0.5 text-[12px] text-[var(--plc-on-subtle)]">{props.summary}</div>
          </div>
          <Button
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
            if (changed()) run(draft());
          }}
        >
          <TextInput
            ref={(el) => {
              input = el;
              // The popover shows its content after placing it; focus once it is visible,
              // scrolled to the end so the folder's own name shows.
              requestAnimationFrame(() => {
                el.focus();
                el.select();
                el.scrollLeft = el.scrollWidth;
              });
            }}
            type="text"
            aria-label="Folder to analyze"
            aria-autocomplete="list"
            placeholder="/path/to/codebase"
            class="font-mono text-[12px]"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!changed() || !draft().trim()}
            title={changed() ? "Analyze this path" : "Type or pick another folder (Rescan reloads this one)"}
          >
            Analyze
          </Button>
        </form>

        <div class="max-h-72 overflow-y-auto border-t border-[var(--plc-border)] py-1">
          <Show when={!browsing()}>
            <PopoverSectionTitle class="mb-0 px-3 pb-1 pt-1.5">Recent folders</PopoverSectionTitle>
          </Show>
          <Show
            when={rows().length > 0}
            fallback={
              <p class="px-3 py-2 text-[12px] text-[var(--plc-on-subtle)]">
                {!browsing()
                  ? "Folders you analyze show up here."
                  : suggestions.loading
                    ? "Looking…"
                    : "No matches. Press Enter to analyze this path."}
              </p>
            }
          >
            <For each={rows()}>
              {(row, i) => {
                const Icon = ICONS[row.icon];
                return (
                  <OptionRow
                    selected={active() === i()}
                    class="flex items-center gap-2 rounded-none px-3 py-1.5"
                    onPointerMove={() => setActive(i())}
                    onClick={() => pick(row)}
                  >
                    <Icon size={13} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
                    <span class="min-w-0 truncate font-mono text-[12px]" title={row.path}>
                      {row.label}
                    </span>
                  </OptionRow>
                );
              }}
            </For>
          </Show>
        </div>
        <div class="border-t border-[var(--plc-border)] px-3 py-1.5 text-[11px] text-[var(--plc-on-subtle)]">
          ↑↓ to pick · Enter to open · Esc to close
        </div>
      </PopoverPanel>
    </Popover>
  );
}
