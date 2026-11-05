export type Graph = { files: string[]; edges: { from: string; to: string }[] };
export type Step = { kind: string; target: string; to: string; line: number; label: string };
export type Plan = { version: number; config: string; handles: Record<string, { file: string }>; steps: Step[] };
export type RunStep = Step & { status: string; graph?: Graph; files: { path: string; status: string; diff: string }[] };
export type Run = {
  id: string; source: string; sourceRoot: string; commit: string; worktree: string;
  status: string; applied: number; steps: RunStep[]; graph?: Graph; error: string | null;
};

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
