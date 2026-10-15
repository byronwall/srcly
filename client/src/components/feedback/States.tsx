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
        "flex h-full w-full flex-col items-center justify-center p-4 text-center text-[var(--plc-on-subtle)]",
        props.class
      )}
    >
      <h2 class="text-[20px] font-semibold leading-tight tracking-[-0.015em] text-[var(--plc-on-surface)] [text-wrap:balance]">
        {props.title}
      </h2>
      <Show when={props.description}>
        <p class="mt-2 max-w-md text-sm leading-relaxed text-[var(--plc-on-subtle)] [text-wrap:pretty]">
          {props.description}
        </p>
      </Show>
      <Show when={props.actions}>
        <div class="mt-6 flex w-full justify-center">{props.actions}</div>
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
        <div class="mb-2 text-[15px] font-semibold">{props.title}</div>
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
