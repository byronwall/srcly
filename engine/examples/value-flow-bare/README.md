# Value-flow with no config

A project with no tsconfig or jsconfig. The engine infers options in memory and writes nothing to the project, and every result says `nullProof: false` and an empty `tsconfig`. `engine/test/srcly/fixture-annotations.test.ts` checks these fixtures.
