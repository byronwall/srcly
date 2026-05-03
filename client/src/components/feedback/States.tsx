import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Button } from "../ui/Button";
import { cx } from "../ui/classes";

type StateTone = "neutral" | "error";

function stateToneClass(tone: StateTone) {
  return tone === "error"
    ? "text-[var(--plc-error)]"
    : "text-[var(--plc-on-subtle)]";
}

export function LoadingState(props: { label?: JSX.Element; class?: string }) {
  return (
    <div
      class={cx(
        "flex h-full w-full items-center justify-center text-sm text-[var(--plc-on-subtle)]",
        props.class
      )}
    >
      {props.label ?? "Loading..."}
    </div>
  );
}

export function EmptyState(props: {
  title: JSX.Element;
  description?: JSX.Element;
  actions?: JSX.Element;
  class?: string;
}) {
  return (
    <div
      class={cx(
        "flex h-full w-full flex-col items-center justify-center text-center text-[var(--plc-on-subtle)]",
        props.class
      )}
    >
      <div class="text-[17px] font-semibold text-[var(--plc-on-surface)]">
        {props.title}
      </div>
      <Show when={props.description}>
        <div class="mt-2 text-sm text-[var(--plc-on-subtle)]">
          {props.description}
        </div>
      </Show>
      <Show when={props.actions}>
        <div class="mt-4">{props.actions}</div>
      </Show>
    </div>
  );
}

export function ErrorState(props: {
  title?: JSX.Element;
  message: JSX.Element;
  onDismiss?: () => void;
  class?: string;
  tone?: StateTone;
}) {
  return (
    <div
      class={cx(
        "flex h-full w-full flex-col items-center justify-center text-center",
        stateToneClass(props.tone ?? "error"),
        props.class
      )}
    >
      <Show when={props.title}>
        <div class="mb-2 text-lg font-bold">{props.title}</div>
      </Show>
      <div class="max-w-xl text-sm">{props.message}</div>
      <Show when={props.onDismiss}>
        <Button
          variant="danger"
          class="mt-4"
          onClick={() => props.onDismiss?.()}
        >
          Close
        </Button>
      </Show>
    </div>
  );
}
