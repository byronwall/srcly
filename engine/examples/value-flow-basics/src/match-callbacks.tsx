import { Match, Show, Switch } from "solid-js";

type Doc = { title: string; sourceId: string | null };

// A `Match` or `Show` with a callback child hands its `when` value to the
// callback's parameter. The value goes on through the parameter's calls, so
// `props.doc` reaches the title and, through a second `Show` whose `when` is a
// field of the parameter, the source id.
export function DocPage(props: { doc: Doc | undefined; failed: boolean }) {
  return (
    <Switch>
      {/* @never-reaches doc */}
      <Match when={props.failed}>
        <p>failed</p>
      </Match>
      {/* @trace doc forward props.doc @outcome doc ok @reaches doc branch-condition */}
      <Match when={props.doc}>
        {(d) => (
          <>
            <h1>{d().title}</h1> {/* @reaches doc render-terminal */}
            <Show when={d().sourceId}>{(id) => <code>{id()}</code>}</Show> {/* @reaches doc */}
          </>
        )}
      </Match>
    </Switch>
  );
}
