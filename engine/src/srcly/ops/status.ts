import { statusResultSchema, type StatusResult } from "../contracts/status";
import { hashProgramInputs, type ProgramInputs } from "../fingerprint";
import { PROTOCOL_VERSION, type ProgressPayload } from "../protocol";

/** What the protocol thread knows about the worker's session, sent after each tier-1 build. */
export type SessionSnapshot = { generation: number; programHash: string; inputs: ProgramInputs };

/**
 * Answered on the protocol thread, never queued behind a running query: the
 * hash is recomputed with one `stat` per file of the last built Program.
 */
export function statusOp(snapshot: SessionSnapshot | null, progress: ProgressPayload | null): StatusResult {
  const currentHash = snapshot ? hashProgramInputs(snapshot.inputs) : null;
  return statusResultSchema.parse({
    protocol: PROTOCOL_VERSION,
    built: snapshot !== null,
    generation: snapshot?.generation ?? null,
    programHash: snapshot?.programHash ?? null,
    currentHash,
    stale: snapshot !== null && currentHash !== snapshot.programHash,
    rssBytes: process.memoryUsage().rss,
    progress,
  });
}
