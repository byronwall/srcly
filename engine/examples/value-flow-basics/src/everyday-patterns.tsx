import { createContext, useContext, useState } from "react";
import { EventEmitter } from "node:events";

// Everyday React and plain-TypeScript patterns, one per block. Each trace
// names the end a reader expects: a context read through a custom hook, an
// input event, an optional handler call, a timer, fetch, an emitter, both
// kinds of generator, an object spread and an object of functions.

// Context read through a custom hook.
const ThemeContext = createContext({ color: "red" });
function useTheme() {
  return useContext(ThemeContext);
}
export function ThemeProvider(props: { color: string; children: unknown }) {
  return <ThemeContext.Provider value={{ color: props.color }}>{props.children as never}</ThemeContext.Provider>; // @trace ev-ctx forward props.color
}
export function Swatch() {
  const theme = useTheme();
  return <i>{theme.color}</i>; // @reaches ev-ctx render-terminal
}

// An event's value read in a handler.
export function Field() {
  const [text, setText] = useState("");
  return <input value={text} onInput={(e) => setText(e.currentTarget.value)} />; // @trace ev-event backward text @outcome ev-event ok @reaches ev-event parameter "e"
}

// Optional call of a handed-in handler.
export function Maybe(props: { word: string; onSay?: (word: string) => void }) {
  return <b onClick={() => props.onSay?.(props.word)}>say</b>;
}
function say(word: string) {
  console.log(word); // @reaches ev-opt
}
export function Sayer(props: { word: string }) {
  return <Maybe word={props.word} onSay={say} />; // @trace ev-opt forward props.word @reaches ev-opt component-occurrence
}

// A timer callback.
export function later(value: string) { // @trace ev-timer forward symbol value
  setTimeout(() => console.log(value), 10); // @reaches ev-timer
}

// fetch, then its JSON.
export async function load(url: string) { // @trace ev-fetch forward symbol url
  // The URL leaves in the request, which ends it there: the response is the server's answer, not a stop on the URL's path. The
  // call's value is taken to carry its argument, so the trace also reaches the return.
  const data = await fetch(url).then((response) => response.json()); // @reaches ev-fetch external-effect @stop ev-fetch network
  return data; // @reaches ev-fetch return
}

// An emitter: emit's value reaches the listener.
const bus = new EventEmitter();
bus.on("save", (text: string) => {
  console.log(text); // @reaches ev-emit
});
export function announce(text: string) { // @trace ev-emit forward symbol text
  bus.emit("save", text);
}

// Delegating and async generators.
function* inner(list: string[]) {
  yield* list;
}
export function firstOf(list: string[]) { // @trace ev-ystar forward symbol list
  for (const item of inner(list)) return item; // @reaches ev-ystar return
  return null;
}
async function* pages(list: string[]) {
  for (const item of list) yield item;
}
export async function firstPage(list: string[]) { // @trace ev-async-gen forward symbol list
  for await (const page of pages(list)) return page; // @reaches ev-async-gen return
  return null;
}

// Object spread, then a field.
export function merged(base: { a: string }, extra: string) { // @trace ev-spread forward symbol extra
  const both = { ...base, b: extra };
  return both.b; // @reaches ev-spread return
}

// An object of functions as a default export, called by member.
const api = {
  shout(text: string) {
    return text.toUpperCase(); // @visits ev-obj return
  },
};
export function callApi(text: string) { // @trace ev-obj forward symbol text
  return api.shout(text); // @reaches ev-obj return
}
