export type Graph = { files: string[]; edges: { from: string; to: string }[] };
export type Step = { kind: string; target: string; to: string; line: number; label: string };
export type SymbolInfo = { file: string; name: string; kind: string; line: number };
export type Diagnostic = { code: string | number; message: string; file?: string; line: number | null; suggestions?: string[] };
export type Plan = { version: number; language: "typescript" | "python"; config: string; handles: Record<string, { file: string; kind?: string; name?: string; text?: string }>; steps: Step[] };
export type Machine = { states: string[]; events: string[]; transitions: { from: string; event: string; to: string }[]; proof: string };
export type Ownership = { provider: string; hook: string; root: { file: string; name: string }; consumers: { file: string; name: string }[]; values: string[]; scope: string };
export type Checkpoint = { name: string; argv: string[]; status: string; exitCode: number; seconds: number; output: string; truncated: boolean };
export type RunStep = Step & { status: string; graph?: Graph; symbols?: SymbolInfo[]; diagnostics?: Diagnostic[]; machine?: Machine; ownership?: Ownership; checkpoint?: Checkpoint; executionCheck?: Checkpoint; files: { path: string; status: string; diff: string }[] };
export type Run = {
  id: string; source: string; sourceRoot: string; commit: string; worktree: string;
  status: string; applied: number; steps: RunStep[]; graph?: Graph; error: string | null;
  diagnostics?: Diagnostic[]; typeDiagnostics?: Diagnostic[]; baselineDiagnostics?: Diagnostic[];
  reviewPath: string; updatedAt?: string;
};
export type RunSummary = Pick<Run, "id" | "sourceRoot" | "status" | "applied" | "reviewPath"> & { stepCount: number; operation: string; label: string; updatedAt: string };

export async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/refactor${url}`, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : result.detail?.message ?? JSON.stringify(result.detail));
  return result;
}

export function download(name: string, source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
