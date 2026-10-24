// The 21 cases behind `functionEffects` (M6). Each function is one case; the
// test names its expected facts and frontiers by line. Nothing here runs.
import { readFileSync, writeFileSync } from "node:fs";
import { imported } from "./leaf";

let counter = 0;
const LIMIT = 10;
export const registry: string[] = [];

// 1. A closed leaf: no effects at all.
export function closedLeaf(a: number, b: number) {
  return a + b;
}

// 2. An imported leaf, called by reference: the callee's (empty) effects come through.
export function callsImportedLeaf(value: string) {
  return imported(value);
}

// 3. A direct call to a helper with an effect: the effect is the caller's, via the helper.
function logIt(message: string) {
  console.log(message);
}
export function directCall(message: string) {
  logIt(message);
}

// 4. The same helper through an alias.
const aliasOfLogIt = logIt;
export function aliasCall(message: string) {
  aliasOfLogIt(message);
}

// 5. A fresh slice, then sort: the sort writes a local, not the parameter.
export function freshSliceThenSort(items: readonly number[]) {
  const copy = items.slice();
  copy.sort();
  return copy;
}

// 6. The parameter itself sorted: a parameter write.
export function inputAliasThenSort(items: number[]) {
  const same = items;
  same.sort();
  return same;
}

// 7. A transitive parameter write: the helper writes what it was handed.
function stamp(target: { seen: boolean }) {
  target.seen = true;
}
export function transitiveParameterWrite(target: { seen: boolean }) {
  stamp(target);
}

// 8. A fresh object, then a child write through a helper: the write stays local to the fresh object, but the helper's write is a parameter write from its own view.
export function freshThenBorrowedChildWrite() {
  const fresh = { seen: false };
  stamp(fresh);
  return fresh;
}

// 9. A returned arrow: its effects are latent.
export function latentReturnedArrow(message: string) {
  return () => console.log(message);
}

// 10. An IIFE: runs now.
export function iife(message: string) {
  (() => {
    console.log(message);
  })();
}

// 11. A timer with a literal callback: a timer fact, the callback's effects on the timer.
export function timer(message: string) {
  setTimeout(() => console.log(message), 10);
}

// 12. A Promise executor: runs now; the settle runs later.
export function promiseExecutor(message: string) {
  return new Promise<void>((resolve) => {
    console.log(message);
    resolve();
  });
}

// 13. An async function that logs after an await: after-await.
export async function asyncLogAfterAwait(url: string) {
  const res = await fetch(url);
  console.log(res.status);
}

// 14. A discarded promise.
export function discardedPromise(url: string) {
  fetch(url);
}

// 15. An awaited promise.
export async function awaitedPromise(url: string) {
  await fetch(url);
}

// 16. A returned promise.
export function returnedPromise(url: string) {
  return fetch(url);
}

// 17. A local arrow named fetch: first party, not the network.
export function localArrowNamedFetch(value: string) {
  const fetch = (input: string) => input.toUpperCase();
  return fetch(value);
}

// 18. A parameter named fetch: a callback frontier, not the network.
export function parameterNamedFetch(fetch: (input: string) => string, value: string) {
  return fetch(value);
}

// 19. A log, then an unknown callback.
export function logThenUnknownCallback(callback: () => void) {
  console.log("before");
  callback();
}

// 20. Mutual recursion, from one of the pair.
export function pingWrites(n: number): number {
  counter += 1;
  return n <= 0 ? n : pongReads(n - 1);
}
export function pongReads(n: number): number {
  if (counter > LIMIT) return n;
  return pingWrites(n - 1);
}

// 21. Filesystem read and write, and module state pushed.
export function fileRoundTrip(file: string) {
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.trim());
  registry.push(file);
  if (!text) throw new Error("empty");
}
