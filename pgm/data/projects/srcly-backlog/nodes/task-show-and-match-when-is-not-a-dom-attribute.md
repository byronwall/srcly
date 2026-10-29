---
id: task-show-and-match-when-is-not-a-dom-attribute
label: Show and Match when is not a DOM attribute
type: task
status: planned
parent: area-data-flow-tsx-usability-audit-2026-10
---
Evidence: `<Match when={doc()}>` and `<Show when={d().originalContentId}>` draw the `when` value as a "DOM attribute" terminal. The value decides which branch renders; it is also handed to the callback child.

Files: `engine/src/analysis/program-evidence-collector-jsx-support.ts` (`addTerminal` for component attributes), `engine/src/srcly/anchor-words.ts`.

Done when: a `when` on Solid's `Show` or `Match` reads "decides a branch", and the fixture `match-callbacks.tsx` claims it.

