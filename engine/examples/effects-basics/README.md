# Effects basics

Fixtures for `functionEffects` (M6, T14): `src/cases.ts` holds the 21 cases, one function each, numbered in comments. `src/opaque-callers.ts` calls the callees in `src/opaque.ts`: one declared with no body, one pure, one with overloads, one effectful, and an interface method. `test/srcly/function-effects.test.ts` names the expected facts and frontiers for each by line.
