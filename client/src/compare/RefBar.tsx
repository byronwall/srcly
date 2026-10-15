import { ArrowLeftRight, ArrowRight } from "lucide-solid";
import { createEffect, createResource, createSignal, For } from "solid-js";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { TextInput } from "../components/ui/TextInput";
import { DEFAULT_BASE, DEFAULT_HEAD, fetchRefs } from "./api";

/** Base → head ref inputs with branch/commit suggestions. Submits on Enter. */
export function RefBar(props: {
  base: string;
  head: string;
  busy: boolean;
  onCompare: (base: string, head: string) => void;
}) {
  const [refs] = createResource(() => fetchRefs().catch(() => null));
  const [base, setBase] = createSignal(props.base);
  const [head, setHead] = createSignal(props.head);
  createEffect(() => setBase(props.base));
  createEffect(() => setHead(props.head));

  const submit = (e?: Event) => {
    e?.preventDefault();
    props.onCompare(base().trim() || DEFAULT_BASE, head().trim() || DEFAULT_HEAD);
  };

  return (
    <form class="flex min-w-0 items-center gap-1.5" onSubmit={submit}>
      <datalist id="srcly-compare-refs">
        <option value={DEFAULT_BASE}>merge-base of {refs()?.defaultBranch ?? "main"} and HEAD</option>
        <option value={DEFAULT_HEAD}>files on disk, including uncommitted edits</option>
        <option value="HEAD">current commit</option>
        <For each={refs()?.branches ?? []}>
          {(b) => <option value={b.name}>{`branch · ${b.date}`}</option>}
        </For>
        <For each={refs()?.commits ?? []}>
          {(c) => <option value={c.sha}>{`${c.subject} · ${c.date}`}</option>}
        </For>
      </datalist>
      <TextInput
        size="sm"
        class="plc-data-sm w-44"
        list="srcly-compare-refs"
        aria-label="Base ref"
        placeholder={DEFAULT_BASE}
        value={base()}
        onInput={(e) => setBase(e.currentTarget.value)}
      />
      <ArrowRight size={14} class="shrink-0 text-[var(--plc-on-subtle)]" aria-hidden="true" />
      <TextInput
        size="sm"
        class="plc-data-sm w-44"
        list="srcly-compare-refs"
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
    </form>
  );
}
