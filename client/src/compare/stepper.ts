// Pure helpers for CommitStepper: which step is showing, and what a step compares.

import type { StepCommit } from "./api";

/**
 * What step `i` compares against: the commit's first parent. On the first-parent
 * line that is the previous commit; for the first step it is usually the range
 * base, but older when the branch merged its base in later.
 */
export const stepBase = (commits: StepCommit[], rangeBase: string, i: number) =>
  commits[i].parent ?? (i === 0 ? rangeBase : commits[i - 1].sha);

/** Step `i` compares its parent (on the first-parent line) against itself. */
export const stepRefs = (commits: StepCommit[], rangeBase: string, i: number) => ({
  base: stepBase(commits, rangeBase, i),
  head: commits[i].sha,
});

/** Index of the step the current compare shows, or -1 for the whole range (or anything else). */
export function activeStep(commits: StepCommit[], rangeBase: string, base: string | null, head: string | null): number {
  const i = commits.findIndex((c) => c.sha === head);
  return i >= 0 && stepBase(commits, rangeBase, i) === base ? i : -1;
}
