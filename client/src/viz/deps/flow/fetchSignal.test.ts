// @vitest-environment jsdom
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { createFetch } from "./fetchSignal";

describe("createFetch", () => {
  it("asks again for the same key on retry, and keeps the newest answer", async () => {
    let calls = 0;
    const { fetch, dispose } = createRoot((dispose) => {
      const [key] = createSignal("anchor");
      return { fetch: createFetch(key, async (k) => `${k} #${++calls}`), dispose };
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch.value()).toBe("anchor #1");
    fetch.retry();
    expect(fetch.loading()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetch.value()).toBe("anchor #2");
    expect(fetch.loading()).toBe(false);
    dispose();
  });
});

it("clears an anchor's previous result while loading and after failure, ignoring late replies", async () => {
  const pending = new Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>();
  const { fetch, setKey, dispose } = createRoot((dispose) => {
    const [key, setKey] = createSignal("first");
    return { fetch: createFetch(key, (k) => new Promise<string>((resolve, reject) => pending.set(k, { resolve, reject })), { keepPrevious: false }), setKey, dispose };
  });
  try {
    pending.get("first")!.resolve("first graph");
    await Promise.resolve();
    expect(fetch.value()).toBe("first graph");
    setKey("second");
    expect(fetch.loading()).toBe(true);
    expect(fetch.value()).toBeUndefined();
    setKey("third");
    pending.get("third")!.reject(new Error("No program element"));
    await Promise.resolve();
    expect(fetch.error()?.message).toBe("No program element");
    expect(fetch.value()).toBeUndefined();
    pending.get("second")!.resolve("late second graph");
    await Promise.resolve();
    expect(fetch.value()).toBeUndefined();
    expect(fetch.error()?.message).toBe("No program element");
    fetch.retry();
    expect(fetch.error()).toBeNull();
    pending.get("third")!.resolve("retried graph");
    await Promise.resolve();
    expect(fetch.value()).toBe("retried graph");
  } finally { dispose(); }
});
