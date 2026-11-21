import { db } from "./db-client";

type SaveRequest = { params: { id: string }; body: { title: string } };

export async function saveNote(request: SaveRequest) {
  const id = request.params.id;
  return db.note.update({ where: { id }, data: {} });
}

// eslint-disable-next-line prefer-const -- the head side writes it
let lastPrice = "";

export function formatPrice(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

export function shownPrice() {
  return lastPrice;
}

export function slugify(title: string) {
  const lower = title.toLowerCase();
  return lower.replace(/\s+/g, "-");
}

export function orderTotal(prices: number[]) {
  let sum = 0;
  for (const price of prices) sum += price;
  return sum;
}

export function handleSubmit(form: { name: string }) {
  const name = form.name.trim();
  console.log(name);
  return name;
}

export function usageUrl(base: string) {
  const key = process.env.USAGE_KEY;
  return key ? `${base}/usage` : base;
}
