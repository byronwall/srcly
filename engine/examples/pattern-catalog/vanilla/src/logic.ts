// V13 map/filter/reduce pipeline
export type Row = { amount: number; kind: "in" | "out" };
export function total(rows: Row[]): number { // @trace v-pipeline forward symbol rows
  return rows.filter((row) => row.kind === "in").map((row) => row.amount).reduce((sum, value) => sum + value, 0);
}

// V14 destructuring with defaults and rest
export function describe(options: { name: string; size?: number; extra?: string }) { // @trace v-destructure forward symbol options
  const { name, size = 1, ...rest } = options;
  return `${name}:${size}:${Object.keys(rest).length}`;
}

// V15 spread merge of objects
export function withDefaults(input: { color?: string }) { // @trace v-spread-merge forward symbol input
  const merged = { color: "red", width: 2, ...input };
  return merged.color;
}

// V16 closure counter factory
export function makeCounter(start: number) { // @trace v-closure forward symbol start
  let count = start;
  return () => {
    count += 1;
    return count;
  };
}

// V17 Map as a store
const cache = new Map<string, string>();
export function remember(key: string, value: string) { // @trace v-map-set forward symbol value
  cache.set(key, value);
}
export function recall(key: string): string | undefined {
  return cache.get(key);
}

// V18 module state written by one function and read by another
let current = "none";
export function select(name: string) { // @trace v-module-state forward symbol name
  current = name;
}
export function selected() {
  return current;
}

// V19 class with fields and methods
export class Cart {
  private items: string[] = [];
  add(item: string) { // @trace v-class-field forward symbol item
    this.items.push(item);
  }
  get size() {
    return this.items.length;
  }
}

// V20 first-party callback API
export function each(values: number[], visit: (value: number) => void) {
  for (const value of values) visit(value);
}
export function sumAll(values: number[]) { // @trace v-callback-api forward symbol values
  let sum = 0;
  each(values, (value) => {
    sum += value;
  });
  return sum;
}

// V21 debounce wrapper
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
export const log = debounce((text: string) => console.log(text), 100);
export function typed(text: string) { // @trace v-debounce forward symbol text
  log(text);
}

// V22 optional chaining and nullish
export function cityOf(user: { address?: { city?: string } } | null) { // @trace v-optional forward symbol user
  return user?.address?.city ?? "unknown";
}

// V23 switch on a discriminant
export type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };
export function area(shape: Shape) { // @trace v-switch forward symbol shape
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.r * shape.r;
    case "square":
      return shape.side * shape.side;
  }
}

// V24 for...of accumulation into an object
export function countBy(words: string[]) { // @trace v-group forward symbol words
  const counts: Record<string, number> = {};
  for (const word of words) counts[word] = (counts[word] ?? 0) + 1;
  return counts;
}

// V25 async generator / iterator
export function* chunks(items: string[], size: number) { // @trace v-generator forward symbol items
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
