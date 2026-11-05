import type { Plan, Step } from "./api";

export const OPERATIONS = [
  ["move-file", "Move file"], ["move-symbol", "Move symbol"], ["rename", "Rename symbol / member"],
  ["extract-function", "Extract function"], ["extract-component", "Extract component"],
  ["add-member", "Add type member"], ["update-member", "Update type member"], ["remove-member", "Remove type member"],
  ["add-type", "Add interface / type"], ["update-type", "Update interface / type"], ["remove-type", "Remove interface / type"],
  ["solid-context", "Global state → context + hook"], ["state-machine", "If/else → state machine"],
  ["checkpoint", "Run test checkpoint"],
];
export const operationName = (kind: string) => OPERATIONS.find(([value]) => value === kind)?.[1] ?? kind;
export function stepTarget(step: Step, plan?: Plan): string {
  const handle = plan?.handles[step.target.slice(1)];
  return step.target.startsWith("$") && handle ? [handle.file, handle.name].filter(Boolean).join(" · ") : step.target;
}
export function statusName(status: string): string {
  return ({ ready: "Ready to apply", "ready-with-errors": "Ready · repairs needed", running: "Partly applied", "running-with-errors": "Partly applied · repairs needed", complete: "Applied", "complete-with-errors": "Applied · repairs needed", blocked: "Needs attention", previewing: "Previewing", validated: "Validated" } as Record<string, string>)[status] ?? status;
}
export function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
