import { track } from "analytics-kit";
import { db } from "./db-client";

type SaveRequest = { params: { id: string }; body: { title: string } };

export async function saveNote(request: SaveRequest) {
  const id = request.params.id;
  const title = request.body.title;
  return db.note.update({ where: { id }, data: { title } });
}

let lastPrice = "";

export function formatPrice(cents: number) {
  const dollars = cents / 100;
  lastPrice = `$${dollars.toFixed(2)}`;
  return lastPrice;
}

export function shownPrice() {
  return lastPrice;
}

export function orderTotal(prices: number[]) {
  let total = 0;
  for (const price of prices) total += price;
  return total;
}

export function handleSubmit(form: { name: string }) {
  const name = form.name.trim();
  track("submit", name);
  console.log(name);
  return name;
}

export async function usageUrl(base: string) {
  const key = process.env.USAGE_KEY;
  await fetch(`${base}/usage?key=${key}`);
  return base;
}

// Moved below the others; the body is the same.
export function slugify(title: string) {
  const lower = title.toLowerCase();
  return lower.replace(/\s+/g, "-");
}
