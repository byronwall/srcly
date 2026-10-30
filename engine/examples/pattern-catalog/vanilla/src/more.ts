// V27 class inheritance with super
class Base {
  constructor(protected name: string) {}
  describe() {
    return `item ${this.name}`;
  }
}
export class Named extends Base {
  describe() {
    return `${super.describe()}!`;
  }
}
export function label(name: string) { // @trace v-super forward symbol name @want return
  return new Named(name).describe();
}

// V28 getter and setter
export class Temperature {
  private celsius = 0;
  set fahrenheit(value: number) { // @trace v-setter forward symbol value @want return
    this.celsius = (value - 32) / 1.8;
  }
  get kelvin() {
    return this.celsius + 273.15;
  }
}

// V29 event delegation with closest
export function wireList(list: HTMLElement, out: HTMLElement) {
  list.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-id]");
    const id = row?.dataset.id; // @trace v-delegation forward row?.dataset.id @want field-read|external-effect
    if (id) out.textContent = id;
  });
}

// V30 for await over an async generator
async function* pages(url: string) {
  for (let page = 1; page < 3; page++) yield (await fetch(`${url}?page=${page}`)).json() as Promise<string[]>;
}
export async function allPages(url: string) { // @trace v-for-await forward symbol url @want external-effect
  const out: string[] = [];
  for await (const rows of pages(url)) out.push(...rows);
  return out;
}

// V31 Object.entries mapped into an object
export function invert(map: Record<string, string>) { // @trace v-entries forward symbol map @want return
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]));
}

// V32 Promise constructor around a callback API
export function wait(ms: number, value: string) { // @trace v-promise-ctor forward symbol value @want return
  return new Promise<string>((resolve) => setTimeout(() => resolve(value), ms));
}

// V33 fetch with an AbortController
export async function search(query: string, signal: AbortSignal) { // @trace v-abort forward symbol query @want external-effect
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  return (await res.json()) as string[];
}

// V34 WeakMap private store
const meta = new WeakMap<object, string>();
export function tag(target: object, note: string) { // @trace v-weakmap forward symbol note @want return
  meta.set(target, note);
}
export function tagOf(target: object) {
  return meta.get(target);
}

// V35 setInterval state
let ticks = 0;
export function start(step: number) { // @trace v-interval forward symbol step @want return|write
  setInterval(() => {
    ticks += step;
  }, 1000);
}
export function elapsed() {
  return ticks;
}

// V36 template element clone
export function renderCard(template: HTMLTemplateElement, title: string) { // @trace v-template forward symbol title @want field-read|external-effect
  const node = template.content.cloneNode(true) as DocumentFragment;
  node.querySelector("h2")!.textContent = title;
  document.body.append(node);
}

// V37 IntersectionObserver callback
export function watch(el: Element, onSeen: (id: string) => void) {
  new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) onSeen(entry.target.id); // @trace v-observer forward entry.target.id @want call|external-effect
  }).observe(el);
}

// V38 reduce into a running total object
export function totals(rows: { k: string; n: number }[]) { // @trace v-reduce-object forward symbol rows @want return
  return rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.k]: (acc[row.k] ?? 0) + row.n }), {});
}
