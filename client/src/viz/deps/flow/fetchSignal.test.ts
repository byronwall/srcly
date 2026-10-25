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
