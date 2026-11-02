import { createResource } from "solid-js";

// `createResource(fetcher, options?)` has no source, and
// `createResource(source, fetcher, options?)` has one. Either way the fetcher's
// return is the resource's value. The source fills the fetcher's parameter and
// never reaches the resource by itself, and a `.json()` call the fetcher only
// reads is not what it returns.
async function loadAll() {
  const stamp = String(Date.now()); // @trace named-fetcher forward symbol stamp @outcome named-fetcher ok
  return { stamp };
}

export function NoSource() {
  const [all] = createResource(loadAll); // @stop named-fetcher framework-runtime resource-input
  return <h1>{all()?.stamp}</h1>; // @stop named-fetcher framework-runtime resource-result @reaches named-fetcher render-terminal
}

export function WithOptions(props: { seed: string }) {
  const [opted] = createResource(loadAll, { initialValue: { stamp: props.seed } }); // @trace resource-seed forward props.seed @stop named-fetcher,resource-seed framework-runtime resource-input
  return <h1>{opted()?.stamp}</h1>; // @stop named-fetcher,resource-seed framework-runtime resource-result @reaches named-fetcher,resource-seed render-terminal
}

export function InlineFetcher(props: { id: string }) {
  const [inline] = createResource(async () => ({ id: props.id })); // @trace inline-fetcher forward props.id @outcome inline-fetcher ok @no-edge inline-fetcher return-value partial @stop inline-fetcher framework-runtime resource-input
  return <h1>{inline()?.id}</h1>; // @stop inline-fetcher framework-runtime resource-result @reaches inline-fetcher render-terminal
}

export function DroppedJson(props: { url: string }) {
  const [held] = createResource(() => props.url, async (url) => { // @trace held-url forward props.url @outcome held-url ok @path held-url "props.url" "url" @no-path held-url "props.url" "held"
    const response = await fetch(url); // @reaches held-url external-effect @stop held-url network fetch-input
    const dropped = await response.json(); // @trace held-json forward response.json() @outcome held-json ok @path held-json "response.json()" "dropped"
    console.log(dropped); // @reaches held-url,held-json external-effect @reaches held-url,held-json stdout
    return { held: "fixed" };
  });
  return <h1>{held()?.held}</h1>; // @never-reaches held-url,held-json
}

export function ReturnedJson(props: { url: string }) {
  const [body] = createResource(() => props.url, async (url) => { // @stop returned-json framework-runtime resource-input
    const response = await fetch(url);
    return response.json(); // @trace returned-json forward response.json() @edge returned-json carrier proven @path returned-json "response.json()" "body()?.title"
  });
  return <h1>{body()?.title}</h1>; // @stop returned-json framework-runtime resource-result @reaches returned-json render-terminal
}

export function BoundJson(props: { url: string }) {
  const [bound] = createResource(() => props.url, async (url) => { // @stop bound-json framework-runtime resource-input
    const response = await fetch(url);
    const parsed = await response.json(); // @trace bound-json forward response.json() @edge bound-json carrier proven @path bound-json "response.json()" "bound()?.title"
    return parsed;
  });
  return <h1>{bound()?.title}</h1>; // @stop bound-json framework-runtime resource-result @reaches bound-json render-terminal
}

export function ReshapedJson(props: { url: string }) {
  const [shaped] = createResource(() => props.url, async (url) => { // @stop shaped-json framework-runtime resource-input
    const response = await fetch(url);
    const parsed = await response.json(); // @trace shaped-json forward response.json() @no-edge shaped-json carrier * @path shaped-json "response.json()" "shaped()?.rows"
    return { rows: parsed.rows };
  });
  return <h1>{shaped()?.rows}</h1>; // @stop shaped-json framework-runtime resource-result @reaches shaped-json render-terminal
}

async function loadBy(url: string) { // @visits named-sourced parameter "url"
  return { url }; // @visits named-sourced return
}

export function NamedFetcher(props: { url: string }) {
  const [named] = createResource(() => props.url, loadBy); // @trace named-sourced forward props.url @stop named-sourced framework-runtime resource-input
  return <h1>{named()?.url}</h1>; // @stop named-sourced framework-runtime resource-result @reaches named-sourced render-terminal
}

export function IgnoredSource(props: { key: string }) {
  const [unused] = createResource(props.key, async () => ({ fixed: "fixed" })); // @trace ignored-source forward props.key @outcome ignored-source partial @stop ignored-source disconnected
  return <h1>{unused()?.fixed}</h1>; // @never-reaches ignored-source
}
