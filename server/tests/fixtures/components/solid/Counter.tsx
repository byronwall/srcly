import { createEffect, createMemo, createSignal, Match, Show, Switch, type Component, type ParentProps } from "solid-js";

type CounterProps = { initial: number; step?: number; label: string };

export const Counter: Component<CounterProps> = (props) => {
  const [count, setCount] = createSignal(props.initial);
  const doubled = createMemo(() => count() * 2);
  createEffect(() => console.log(count()));

  return (
    <div>
      <Show when={count() > 0} fallback={<p>Zero</p>}>
        <p>{props.label}: {count()}</p>
      </Show>
      <Switch>
        <Match when={doubled() > 10}>
          <b>big</b>
        </Match>
        <Match when={doubled() <= 10}>
          <i>small</i>
        </Match>
      </Switch>
      <button onClick={() => setCount(count() + (props.step ?? 1))}>+</button>
    </div>
  );
};

export function Panel(props: ParentProps<{ title: string }>) {
  return (
    <section>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}
