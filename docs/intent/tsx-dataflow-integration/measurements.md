---
title: "Bring tsx-data-flow into srcly — measurements"
slug: "tsx-dataflow-integration"
phase: plan
status: current
last_updated: "2026-10-23"
---

# Measurements

Every number this initiative records. Append a dated row per milestone; never overwrite an earlier one.

## 2026-10-23 — planning baseline

Machine: development Mac. Node v22.21.1. tsx-data-flow `b4f1ba4` plus the uncommitted route-proof edits, run from its checkout with `node --import tsx`. TypeScript 5.9.3 resolved from each target project. One cold run per target, wall clock from `performance.now()`.

| Target | Source files | `buildProgram` | `buildIdentityIndex` | `analyzer.report()` (full legacy report) | `buildRouteDataInventory` | RSS after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| srcly `client/` (`tsconfig.app.json`, 26K lines) | 126 | 1,209 ms | 1,796 ms | 129,962 ms | 2 ms (0 routes) | 2,419 MB |
| visual-notes `app/` (`tsconfig.json`, 65K lines) | 487 | 4,323 ms | 9,542 ms | 44,166 ms | 17,494 ms (43 routes) | 2,023 MB |

A second run of the CLI end to end (`pnpm analyze --root srcly/client --source src --tsconfig tsconfig.app.json --view overview --format json`) took 2 min 13 s wall and wrote a 421 KB overview.

Routes discovered on visual-notes include `/time-blocks`, `/tasks`, `/canvas`, `/docs/[id]`, `/api/auth/[...solidauth]` and 38 others.

Script: a throwaway `time-phases.ts` that called `parseArgs`, `createAnalyzer`, `analyzer.report()` and `buildRouteDataInventory` in sequence and printed `process.memoryUsage().rss`. It is not checked in; M1 adds an equivalent `engine/scripts/time-phases.ts`.

## To record next

| Milestone | Numbers |
| --- | --- |
| M1 | cold `hello` plus tier 1 on solid-route, srcly `client/`, visual-notes `app/`; RSS after tier 1 |
| M2 | first `routeGraph` per route on visual-notes (`/time-blocks`, `/tasks`); payload sizes; four layout screenshots at 1440 and 1024 |
| M3 | warm `valueFlow` p95 over 20 queries; cold `hello` to first ledger row; Return p95 over 20 returns |
| M6 | `functionEffects` on the three anchors |
| M7 | tier 2 on `examples/bad-ish-solid` and on srcly `client/` from the batch job |
| M8 | wheel size before and after; clean-venv smoke time |
