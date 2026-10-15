---
title: "PR compare mode"
slug: "pr-compare"
phase: intent
status: current
last_updated: "2026-10-15"
---

# PR compare mode

## My read

You want srcly to answer "what did this PR do to the codebase, and did it make things better or worse?" in one glance. You'd pick two commits, usually the PR's base and its head. srcly analyzes both and shows them side by side: the file tree and the dependency graph, before on the left and after on the right.

The views are focused by default. Only the files the PR touched appear, plus just enough nearby context to make sense of them. You can widen the view on request. The tool doesn't hand you two full dashboards to compare by eye.

The output has to be deterministic. It comes straight from the code on disk and the git diff, with no LLM in the loop. The 2026-08-23 memo frames this as the bar for a trustworthy PR diagram. Once the analysis exists, lighting up a change on it is "a pretty straightforward matter".

That memo also asks a broader question: are a PR's changes coherent, or could they be split? It suggests answering it with "islands of change" and how far an edit ripples up and down the call chain. That is the longer horizon. This initiative is about srcly's existing tree, metrics, and dependency graph.

## What matters most

- **Strong before/after left/right views** of the tree and the dependency graph, with unchanged items in the same place on both sides.
- **A clear better/worse signal** from metric deltas (complexity, size, nesting, coupling) whose direction you can read at a glance.
- **Focused on the changed files by default**, so a 12-file PR in a 2,000-file repo reads like a 12-file PR.

## The experience you appear to want

Pick any two refs, or accept the default: the working tree against its merge-base with `main`. srcly scans both. The landing view summarizes the PR: files added, removed, and modified, net metric movement, and edges gained or lost. The tree lists only the changed files, with before → after values and colored deltas. The dependency graph shows the changed files and their direct neighbors twice, before and after. Each side marks what was removed or added, and both share one layout so your eye can jump between them. Widening the focus brings in unchanged context, which renders quietly.

## Boundaries

### Must be true

- The same two commits always produce the same picture.
- Nodes that exist on both sides sit in the same position on both sides.
- "Better" and "worse" follow each metric's real direction. srcly already records which metrics are lower-is-better.
- Scanning a commit leaves your working tree, branch, and stash alone.

### Must be avoided

- Two independent full-repo renders that you have to diff by eye.
- Lighting up the whole graph when a widely used file changes, without saying that's what happened.
- An LLM-generated summary standing in for the analysis.

## What seems settled

- The comparison runs between two git commits.
- It covers the tree view and the dependency graph first. "Other metrics" means the existing per-file metrics.
- Focusing on changed files is the default, not an option.

## Possibilities, not decisions

- Change "islands": finding groups of changed files that don't connect, as a sign the PR could be split.
- Ripple and frontier views (callers of a changed function that did or didn't need edits), plus route and component lenses from the tsx-data-flow memo.
- Opening a GitHub PR by number, or a headless `srcly compare` report for agents and CI.

## Current reality that matters

- Scans target a directory, and the cache is keyed by path plus an mtime fingerprint. Nothing yet scans a commit that isn't checked out.
- The dependency graph uses one language-neutral contract (folder → file → symbol, for TS and Python), and the client does the roll-up and layout. A diff of two graphs fits that contract naturally.
- The dependency layout is srcly's own grid layout (`client/src/viz/deps/layout.ts`), not ELK. Pinning a shared layout across two graphs is under our control.
- The dependency-view initiative is still active, with stacked PRs awaiting merge. Compare mode builds on top of it.

## Decided in question round 1

- Per-metric movement plus a neutral net line, with no overall verdict.
- "Tree view" covers the Explorer table and side-by-side treemaps in v1.
- The default head is the working tree. Base and head can be set to any commit, because comparing arbitrary commits is coming soon.

## Next step after confirmation

Next is an implementation plan with a first proof on srcly's own history.
