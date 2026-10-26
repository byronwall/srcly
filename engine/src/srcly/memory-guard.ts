import v8 from "node:v8";
import vm from "node:vm";
import { EngineError } from "./protocol";

/**
 * A bound on the memory one engine keeps between requests. The session's
 * caches (the Program, its checker, the evidence provider) grow with the
 * part of the program the queries have touched, up to the whole program.
 * After each request, when the heap that survives a full GC passes the
 * limit, the session drops all of them; the next query rebuilds. When a
 * rebuilt session passes the limit again, the engine's working set is over
 * the limit on its own, so it answers `memory-limit` (not analyzed, named)
 * instead of growing, until a refresh.
 *
 * The rebuild is the release's whole cost: the checker's caches (most of
 * what grows) have no other way out, and a Program rebuilt from the same
 * inputs gives the same results under the same generation.
 */
export const MEMORY_LIMIT_ENV = "SRCLY_DATAFLOW_MEMORY_MB";
export const DEFAULT_MEMORY_LIMIT_MB = 2560;

/** The limit in bytes; null when switched off with `SRCLY_DATAFLOW_MEMORY_MB=0`. */
export function memoryLimitFromEnv(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env[MEMORY_LIMIT_ENV]?.trim();
  const mb = raw ? Number(raw) : DEFAULT_MEMORY_LIMIT_MB;
  if (!Number.isFinite(mb) || mb < 0) return DEFAULT_MEMORY_LIMIT_MB * 1024 * 1024;
  return mb === 0 ? null : mb * 1024 * 1024;
}

/** What the guard needs from a session: drop everything it holds. */
export type Releasable = { built: () => boolean; release: () => void };

export type HeapProbe = {
  /** The heap in use now, garbage included: cheap, read after every request. */
  used: () => number;
  /** The heap that survives a full collection: run only when `used` passes the limit. */
  retained: () => number;
};

let collect: (() => void) | null = null;

/** This isolate's heap; `retained` forces a full GC, which needs `--expose-gc`, set here at runtime. */
export const v8HeapProbe: HeapProbe = {
  used: () => v8.getHeapStatistics().used_heap_size,
  retained: () => {
    if (!collect) {
      v8.setFlagsFromString("--expose-gc");
      collect = vm.runInNewContext("gc") as () => void;
    }
    collect();
    return v8.getHeapStatistics().used_heap_size;
  },
};

export type GuardOutcome = "under" | "released" | "refusing";

export class MemoryGuard {
  /** The session was rebuilt after a release: passing the limit again means its own working set is over it. */
  private rebuiltAfterRelease = false;
  private refusal: { retained: number } | null = null;

  constructor(
    private readonly session: Releasable,
    readonly limit: number | null = memoryLimitFromEnv(),
    private readonly probe: HeapProbe = v8HeapProbe,
  ) {}

  /** Before a request that needs the session: refuse it, by name, while the engine is over its limit. */
  admit(): void {
    if (!this.refusal || this.limit === null) return;
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    throw new EngineError(
      "memory-limit",
      `This program needs more than the engine's ${mb(this.limit)} MB memory limit (${mb(this.refusal.retained)} MB after rebuilding); raise ${MEMORY_LIMIT_ENV} to analyze it`,
      { limitBytes: this.limit, retainedBytes: this.refusal.retained },
    );
  }

  /**
   * After a request: drop the session's caches when what it keeps is over
   * the limit. The first request on a session rebuilt after a release decides
   * whether the rebuild fits: under the limit, later growth is released
   * again; over it, the engine refuses rather than rebuild in a loop.
   */
  settle(): GuardOutcome {
    if (this.limit === null) return "under";
    if (this.refusal) return "refusing";
    const retained = this.probe.used() > this.limit ? this.probe.retained() : 0;
    if (retained <= this.limit) {
      if (this.session.built()) this.rebuiltAfterRelease = false;
      return "under";
    }
    const rebuilt = this.rebuiltAfterRelease && this.session.built();
    this.session.release();
    // Whatever survives without the session is not the session's to drop.
    const rest = this.probe.retained();
    if (rebuilt || rest > this.limit) {
      this.refusal = { retained: rebuilt ? retained : rest };
      this.rebuiltAfterRelease = false;
      return "refusing";
    }
    this.rebuiltAfterRelease = true;
    return "released";
  }

  /** A refresh rebuilds from the sources as they are now: try again from scratch. */
  reset(): void {
    this.refusal = null;
    this.rebuiltAfterRelease = false;
  }
}
