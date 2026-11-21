import { createResource, createSignal, For, Show, Suspense } from "solid-js";
import { action, createAsync, query, redirect, useAction, useNavigate, useParams, useSearchParams, useSubmission, type RouteSectionProps } from "@solidjs/router";
import { makePersisted } from "@solid-primitives/storage";

type Story = { id: string; title: string };

// S43 query + createAsync, traced from the render back to the request
const getStory = query(async (id: string) => {
  const response = await fetch(`/api/story/${id}`);
  return (await response.json()) as Story;
}, "story");
export function StoryPage(props: { id: string }) {
  const story = createAsync(() => getStory(props.id));
  return <Suspense><h1>{story()?.title}</h1></Suspense>; // @trace s-query-async backward story()?.title @want fetch-input
}

// S44 the id goes into the query's request
export function StoryLoader(props: { id: string }) { // @trace s-query-arg forward props.id @want external-effect
  const story = createAsync(() => getStory(props.id));
  return <p>{story()?.id}</p>;
}

// S45 route preload with params
export const route = {
  preload: ({ params }: { params: { id: string } }) => getStory(params.id), // @trace s-preload forward params.id @want external-effect
};

// S46 route component reads params into a query
export default function StoryRoute(props: RouteSectionProps) {
  const story = createAsync(() => getStory(props.params.id)); // @trace s-route-params forward props.params.id @want external-effect
  return <p>{story()?.title}</p>;
}

// S47 "use server" function behind an action, called with FormData
const saveTitle = action(async (form: FormData) => {
  "use server";
  const title = String(form.get("title"));
  await fetch("/api/save", { method: "POST", body: title }); // @trace s-action-formdata backward title @want parameter|external-read
  throw redirect("/done");
}, "saveTitle");
export function TitleForm() {
  return <form action={saveTitle} method="post"><input name="title" /></form>;
}

// S48 useAction called from a handler
const rename = action(async (id: string, name: string) => {
  "use server";
  return fetch(`/api/rename/${id}`, { method: "POST", body: name });
}, "rename");
export function RenameButton(props: { id: string; name: string }) { // @trace s-use-action forward props.name @want external-effect
  const run = useAction(rename);
  return <button onClick={() => run(props.id, props.name)}>rename</button>;
}

// S49 useSubmission result rendered
const addTodo = action(async (title: string) => {
  "use server";
  const response = await fetch("/api/todos", { method: "POST", body: title });
  return (await response.json()) as { id: string };
}, "addTodo");
export function Added() {
  const submission = useSubmission(addTodo);
  return <Show when={submission.result}>{(result) => <p>{result().id}</p>}</Show>; // @trace s-submission-result backward result().id @want fetch-input
}

// S50 useSubmission input shown while pending (optimistic)
export function Pending() {
  const submission = useSubmission(addTodo);
  const add = useAction(addTodo);
  return <p onClick={() => add("milk")}>{submission.input?.[0]}</p>; // @trace s-submission-input backward submission.input?.[0] @want literal
}

// S51 search params read into a resource source
export function Search() {
  const [search] = useSearchParams<{ q: string }>();
  const [hits] = createResource(() => search.q, async (q) => (await fetch(`/api/search?q=${q}`)).json() as Promise<string[]>); // @trace s-search-resource forward search.q @want external-effect
  return <For each={hits()}>{(hit) => <li>{hit}</li>}</For>;
}

// S52 resource with a signal source
export function UserCard(props: { next: string }) { // @trace s-resource-signal-source forward props.next @want external-effect
  const [id, setId] = createSignal("1");
  const [user] = createResource(id, async (key) => (await fetch(`/api/users/${key}`)).json() as Promise<{ name: string }>);
  return <p onClick={() => setId(props.next)}>{user()?.name}</p>;
}

// S53 resource mutate (optimistic write)
export function Likes(props: { bump: number }) { // @trace s-resource-mutate forward props.bump @want render-terminal
  const [likes, { mutate }] = createResource(async () => (await fetch("/api/likes")).json() as Promise<number>);
  return <button onClick={() => mutate(props.bump)}>{likes()}</button>;
}

// S54 resource refetch with info
export function Feed(props: { cursor: string }) { // @trace s-resource-refetch forward props.cursor @want external-effect
  const [page, { refetch }] = createResource(async (_: true, info: { refetching: unknown }) => (await fetch(`/api/feed?after=${String(info.refetching)}`)).text());
  return <pre onClick={() => refetch(props.cursor)}>{page()}</pre>;
}

// S55 navigate with params and a search string built from state
export function Pager(props: { page: number }) { // @trace s-navigate-search forward props.page @want external-effect
  const navigate = useNavigate();
  const params = useParams();
  return <button onClick={() => navigate(`/list/${params.kind}?page=${props.page + 1}`, { replace: true })}>next</button>;
}

// S56 persisted signal written from an input
export function Nickname() {
  const [nick, setNick] = makePersisted(createSignal(""), { name: "nick" });
  return <input value={nick()} onInput={(e) => setNick(e.currentTarget.value)} />; // @trace s-persisted-input forward e.currentTarget.value @want dom-terminal
}

// S57 localStorage initial value
export function Draft() {
  const [draft, setDraft] = createSignal(localStorage.getItem("draft") ?? "");
  return <textarea onInput={(e) => setDraft(e.currentTarget.value)}>{draft()}</textarea>; // @trace s-localstorage-initial backward draft() @want external-read
}

// S58 a prop saved to localStorage by a handler
export function SaveDraft(props: { text: string }) { // @trace s-localstorage-write forward props.text @want external-effect
  return <button onClick={() => localStorage.setItem("draft", props.text)}>save</button>;
}
