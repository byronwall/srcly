# Local activity — shape

**Outcome:** A reviewer can see why a structurally difficult file deserves attention now.

**Primary flow:** Enable local history → choose a window → inspect activity beside complexity → open supporting commits.

## Feature scope

```text
Local activity context
├── PLANNED ADDITIONS
│   ├── File change frequency
│   │   ├── Window, revision, merge and rename policy visible
│   │   └── Supporting commit list; churn shown separately
│   ├── Comparison with source structure
│   │   └── Activity and complexity shown as distinct axes
│   └── Honest support
│       └── No Git, shallow history and dirty source clearly identified
└── EVALUATE BEFORE COMMITTING
    └── Default visibility after distinct decision value is demonstrated
```

## Decisions and boundaries

**Appetite:** One bounded local Git pass and a file-level review flow.

**Key decision:** Read a declared history window and verify counts before adding a hotspot formula. A frequently changed file can be important and healthy.

**Boundary:** No fetch, people scoring, background service or automatic refactoring advice. Keep the source-only path available by disabling activity. Cache against HEAD and policy; do not invalidate all AST measurements when only the window changes.

**First proof:** A history table whose counts can be checked against Git.

**Try:** Use a small local repository containing renames, a merge, a bulk change, and a shallow-history case.

**Observe:** Compare every count and supporting commit with the declared traversal policy.

**Decide:** Stop integration if history completeness or counts cannot be explained. Default visibility needs useful new decisions in two pilot repositories.

See the [implementation plan](implementation-plan.md).
