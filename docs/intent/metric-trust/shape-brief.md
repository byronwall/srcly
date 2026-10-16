# Trustworthy metrics and ranking — shape

**Outcome:** Each displayed value has a clear meaning and leads to the source evidence that produced it.

**Primary flow:** Scan → choose files or functions → inspect a metric → open its source and support details.

## Feature scope

```text
Trustworthy explorer and reports
├── PLANNED ADDITIONS
│   ├── Scope and support
│   │   ├── Real functions distinguished from display containers
│   │   └── Measured zero, unsupported, skipped, partial and failed states
│   ├── Honest measurements
│   │   ├── Explicit line units and conserved display area
│   │   └── Maximum with source location; consistent counts and means
│   └── Explainable comparison
│       ├── Declared file/function cohort and metric eligibility
│       ├── Matching report/list order and visible score contributions
│       └── Neutral diagnostics, current selection and matching filters
└── EVALUATE BEFORE COMMITTING
    └── Scope-level TS counters only when they support useful inspection
```

## Behavior

| Situation | Expected result |
| --- | --- |
| A metric does not apply | Show N/A and exclude it from numeric comparisons. |
| A supported count equals zero | Show zero; keep the declared denominator. |
| A folder shows maximum complexity | Open the responsible executable function. |
| A user filters or changes scope | Show the comparison population and current selected source. |

## Decisions and boundaries

**Appetite:** Correct existing semantics and presentation before adding another metric family.

**Key decision:** Share a written ranking specification and fixtures across Python and TypeScript. Use direct implementations rather than a cross-language scoring framework. Default to one explicit metric; an optional combination must expose its inputs.

**Boundary:** Keep the existing layout. Use one current API contract. Revert a failed slice as a commit; do not maintain parallel versions. Persistent triage and trends remain outside this initiative.

**First proof:** One small real scan and its report.

**Try:** Scan a TS/Python fixture with nested functions, display scopes, measured zero, and skipped analysis.

**Observe:** Check the executable population, availability labels, source locations, and report values by hand.

**Decide:** Continue only if zero and unavailable remain distinct end to end and each maximum identifies the correct function.

See the [implementation plan](implementation-plan.md).
