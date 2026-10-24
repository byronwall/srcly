import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashProgramInputs, type ProgramInputs } from "./fingerprint";

/**
 * Results on disk, keyed by the Program's hash (T11). A new engine process
 * rehashes the last build's inputs (one `stat` per file) before it builds
 * anything; when the hash matches, the routes, surfaces, graphs and ledgers
 * written by the last process answer at once, with the generation rewritten
 * to this process's, while tier 1 builds behind them. A changed hash is a
 * miss: nothing is served until the build answers, and the old entries are
 * pruned once two newer hashes exist.
 *
 * Layout: `<dir>/<root hash>/inputs.json` names the last build's inputs and
 * hash; `<dir>/<root hash>/<program hash>/<op>/<key hash>.json` holds one
 * result. Switched off with `SRCLY_DATAFLOW_CACHE=0`, or when no directory
 * is given.
 */
export const CACHE_DIR_ENV = "SRCLY_DATAFLOW_CACHE_DIR";
export const CACHE_SWITCH_ENV = "SRCLY_DATAFLOW_CACHE";
/** Ops whose results are cached: each is a function of the Program alone. */
export const CACHED_OPS = new Set(["routes", "routeSurface", "routeGraph", "anchorGraph", "valueFlow", "selectExpression", "functionEffects"]);
/** Program hashes kept per root; older ones are removed. */
const KEEP_HASHES = 2;
/** A single result bigger than this is not written. */
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;

type Manifest = { root: string; programHash: string; inputs: ProgramInputs; writtenAt: string };

export function cacheDirFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env[CACHE_SWITCH_ENV] === "0") return null;
  const dir = env[CACHE_DIR_ENV];
  return dir ? path.resolve(dir) : null;
}

export class ResultCache {
  private readonly rootDir: string;
  private manifest: Manifest | null = null;
  /** The hash the current sources have, when it equals the last build's: entries under it are valid now. */
  private validHash: string | null = null;

  constructor(dir: string, private readonly root: string) {
    this.rootDir = path.join(dir, createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16));
    this.load();
  }

  /** Rehash the last build's inputs; the cache is valid when nothing changed since. */
  private load(): void {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(this.rootDir, "inputs.json"), "utf8")) as Manifest;
      if (manifest.root !== path.resolve(this.root)) return;
      this.manifest = manifest;
      this.validHash = hashProgramInputs(manifest.inputs) === manifest.programHash ? manifest.programHash : null;
    } catch {
      this.manifest = null;
      this.validHash = null;
    }
  }

  /** The program hash the sources have now when it matches the last build; null means nothing can be served. */
  get hash(): string | null {
    return this.validHash;
  }

  /** The hash the sources have at this moment, from the last build's inputs; null without a manifest. */
  currentHash(): string | null {
    return this.manifest ? hashProgramInputs(this.manifest.inputs) : null;
  }

  /** A cached result for this op and params, under the valid hash. */
  get(op: string, params: Record<string, unknown>): Record<string, unknown> | null {
    if (!this.validHash || !CACHED_OPS.has(op)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.entryPath(this.validHash, op, params), "utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Remember a result the worker produced for `inputs` hashing to `programHash`.
   * The manifest moves to that hash, so the next process serves these entries.
   */
  put(op: string, params: Record<string, unknown>, result: Record<string, unknown>, inputs: ProgramInputs, programHash: string): void {
    if (!CACHED_OPS.has(op)) return;
    const text = JSON.stringify(result);
    if (Buffer.byteLength(text) > MAX_ENTRY_BYTES) return;
    try {
      const file = this.entryPath(programHash, op, params);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, text);
      fs.renameSync(`${file}.tmp`, file);
      if (this.manifest?.programHash !== programHash) {
        this.manifest = { root: path.resolve(this.root), programHash, inputs, writtenAt: new Date().toISOString() };
        fs.writeFileSync(path.join(this.rootDir, "inputs.json"), JSON.stringify(this.manifest));
        this.prune(programHash);
      }
      this.validHash = programHash;
    } catch {
      // A full or read-only disk only costs the next reopen its head start.
    }
  }

  private entryPath(programHash: string, op: string, params: Record<string, unknown>): string {
    const key = createHash("sha256").update(stableJson(params)).digest("hex").slice(0, 24);
    return path.join(this.rootDir, programHash, op, `${key}.json`);
  }

  /** Keep the newest `KEEP_HASHES` program hashes for this root. */
  private prune(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.rootDir, { withFileTypes: true });
    } catch {
      return;
    }
    const hashes = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, mtime: fs.statSync(path.join(this.rootDir, entry.name)).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
    const keep = new Set([current, ...hashes.slice(0, KEEP_HASHES).map((item) => item.name)]);
    for (const item of hashes) if (!keep.has(item.name)) fs.rmSync(path.join(this.rootDir, item.name), { recursive: true, force: true });
  }
}

/** JSON with sorted keys, so the same params always name the same entry. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
