import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const solidRoute = path.join(engineRoot, "examples/solid-route");

type Frame = { id?: number; ok?: boolean; result?: unknown; error?: { code: string; message: string }; progress?: unknown };

/** The real bin, run through tsx and driven over its pipes. */
export function startEngine(root: string, extra: string[] = [], env: NodeJS.ProcessEnv = {}) {
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    ["--import", "tsx", path.join(engineRoot, "bin/srcly-engine.ts"), "--root", root, ...extra],
    // The result cache is off unless a test gives it a directory.
    { cwd: engineRoot, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, SRCLY_DATAFLOW_CACHE_DIR: "", ...env } },
  );
  const frames: Frame[] = [];
  const waiters: { id: number; resolve: (frame: Frame) => void }[] = [];
  const stdoutLines: string[] = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    stdoutLines.push(line);
    const frame = JSON.parse(line) as Frame;
    frames.push(frame);
    if (frame.progress !== undefined) return;
    const index = waiters.findIndex((waiter) => waiter.id === frame.id);
    if (index >= 0) waiters.splice(index, 1)[0].resolve(frame);
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  return {
    child,
    frames,
    stdoutLines,
    stderr: () => stderr,
    exited,
    send(frame: unknown) {
      child.stdin.write(`${JSON.stringify(frame)}\n`);
    },
    request(id: number, op: string, params: Record<string, unknown> = {}) {
      const reply = new Promise<Frame>((resolve) => waiters.push({ id, resolve }));
      child.stdin.write(`${JSON.stringify({ id, op, params })}\n`);
      return reply;
    },
    close() {
      child.stdin.end();
      return exited;
    },
  };
}
