// V6 fetch -> json -> field -> return
export async function loadTitle(id: string): Promise<string> { // @trace v-fetch-id forward symbol id @want external-effect
  const res = await fetch(`/api/items/${id}`);
  const body = (await res.json()) as { title: string };
  return body.title;
}

// V7 then-chain
export function loadCount(url: string): Promise<number> { // @trace v-then-chain forward symbol url @want external-effect
  return fetch(url)
    .then((res) => res.json())
    .then((body: { count: number }) => body.count);
}

// V8 localStorage round trip
export function saveTheme(theme: string) { // @trace v-storage-set forward symbol theme @want external-effect
  localStorage.setItem("theme", theme);
}
export function readTheme(): string {
  const stored = localStorage.getItem("theme"); // @trace v-storage-get forward localStorage.getItem("theme") @want return
  return stored ?? "light";
}

// V9 Promise.all over mapped fetches
export async function loadAll(ids: string[]) { // @trace v-promise-all forward symbol ids @want external-effect
  const titles = await Promise.all(ids.map((id) => loadTitle(id)));
  return titles.join(", ");
}

// V10 try/catch rethrow with a message
export async function safeLoad(id: string) { // @trace v-try-catch forward symbol id @want external-effect
  try {
    return await loadTitle(id);
  } catch (error) {
    throw new Error(`load ${id} failed: ${String(error)}`);
  }
}

// V11 URLSearchParams read
export function pageFromUrl(): number {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page"); // @trace v-url-param forward params.get("page") @want return
  return Number(page ?? "1");
}

// V12 JSON parse of a string
export function parseConfig(text: string): { debug: boolean } { // @trace v-json-parse forward symbol text @want return
  const parsed = JSON.parse(text) as { debug?: boolean };
  return { debug: parsed.debug ?? false };
}
