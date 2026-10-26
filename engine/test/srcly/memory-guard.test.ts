import { describe, expect, it } from "vitest";
import { DEFAULT_MEMORY_LIMIT_MB, MemoryGuard, memoryLimitFromEnv, v8HeapProbe, type HeapProbe } from "../../src/srcly/memory-guard";
import { EngineError } from "../../src/srcly/protocol";

const MB = 1024 * 1024;

/** A session that holds `held` bytes while built, over a `base` nothing can drop. */
function fixture(limitMb: number, base = 100 * MB) {
  const state = { built: false, held: 0, releases: 0, rebuilds: 0 };
  const session = {
    built: () => state.built,
    release: () => {
      state.built = false;
      state.held = 0;
      state.releases += 1;
    },
  };
  /** A request: rebuilds when released, then holds `bytes` more. */
  const request = (bytes: number) => {
    if (!state.built) {
      state.built = true;
      state.rebuilds += 1;
    }
    state.held += bytes;
  };
  const probe: HeapProbe = { used: () => base + state.held + 50 * MB, retained: () => base + state.held };
  return { state, request, guard: new MemoryGuard(session, limitMb * MB, probe) };
}

function admitted(guard: MemoryGuard) {
  try {
    guard.admit();
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("memory-limit");
    return false;
  }
}

describe("memory guard", () => {
  it("keeps the session while what it retains is under the limit", () => {
    const { state, request, guard } = fixture(1000);
    for (let i = 0; i < 5; i += 1) {
      request(100 * MB);
      expect(guard.settle()).toBe("under");
    }
    expect(state.releases).toBe(0);
  });

  it("drops the session when growth passes the limit, and keeps answering after the rebuild", () => {
    const { state, request, guard } = fixture(1000);
    const outcomes = [];
    for (let i = 0; i < 30; i += 1) {
      expect(admitted(guard)).toBe(true);
      request(200 * MB);
      outcomes.push(guard.settle());
    }
    // Each rebuild fits on its first request, so growth is released again and again: never refused.
    expect(outcomes).not.toContain("refusing");
    expect(state.releases).toBeGreaterThan(3);
    expect(state.held).toBeLessThanOrEqual(1000 * MB);
  });

  it("refuses by name when a rebuilt session's first request is still over the limit", () => {
    const { state, request, guard } = fixture(1000);
    request(1200 * MB);
    expect(guard.settle()).toBe("released");
    expect(admitted(guard)).toBe(true);
    request(1200 * MB);
    expect(guard.settle()).toBe("refusing");
    expect(state.built).toBe(false);
    expect(admitted(guard)).toBe(false);
    // A refresh starts over.
    guard.reset();
    expect(admitted(guard)).toBe(true);
  });

  it("refuses when memory outside the session is over the limit", () => {
    const { request, guard } = fixture(1000, 1100 * MB);
    request(10 * MB);
    expect(guard.settle()).toBe("refusing");
    expect(admitted(guard)).toBe(false);
  });

  it("does nothing when switched off", () => {
    const { state, request, guard } = fixture(1000);
    const off = new MemoryGuard({ built: () => true, release: () => { state.releases += 1; } }, null);
    request(5000 * MB);
    expect(off.settle()).toBe("under");
    expect(state.releases).toBe(0);
    expect(guard.limit).toBe(1000 * MB);
  });

  it("reads its limit from SRCLY_DATAFLOW_MEMORY_MB", () => {
    expect(memoryLimitFromEnv({})).toBe(DEFAULT_MEMORY_LIMIT_MB * MB);
    expect(memoryLimitFromEnv({ SRCLY_DATAFLOW_MEMORY_MB: "4096" })).toBe(4096 * MB);
    expect(memoryLimitFromEnv({ SRCLY_DATAFLOW_MEMORY_MB: "0" })).toBeNull();
    expect(memoryLimitFromEnv({ SRCLY_DATAFLOW_MEMORY_MB: "lots" })).toBe(DEFAULT_MEMORY_LIMIT_MB * MB);
  });

  it("measures the heap after a full collection without --expose-gc", () => {
    let garbage: number[][] | null = Array.from({ length: 200 }, () => new Array(10_000).fill(1));
    const before = v8HeapProbe.used();
    garbage = null;
    expect(garbage).toBeNull();
    expect(v8HeapProbe.retained()).toBeLessThan(before);
  });
});
