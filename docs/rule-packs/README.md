# Rule packs

srcly runs the ast-grep rules in a project's `.srcly/rules/*.yml` as a findings checker, labelled "ast-grep (N rules in .srcly/rules)". Each match shows under the rule's `id`. srcly finds ast-grep as `SRCLY_AST_GREP`, the project's `node_modules/.bin/ast-grep`, or `ast-grep` on PATH. When ast-grep is missing, the rule pack's files are N/A with that reason.

`.srcly/` is also the default `srcly report` output folder. If your `.gitignore` ignores it, add `!.srcly/rules/` so that the rules stay versioned.

## visual-notes

Rules mined from Visual Notes fix commits (TASK-0017, probe P9). Each one was backtested on the pre-fix code.

| Rule | Finds |
| --- | --- |
| `solid-cleanup-return` (`r1`, `r1b`) | A cleanup returned from `onMount`/`createEffect`, which Solid ignores. srcly's built-in `solid-returned-cleanup` covers this too, with a fix. |
| `paged-order-no-tiebreak` (`r3`) | A Prisma query paged with `skip`/`cursor` and ordered by a timestamp alone. |
| `small-text-input` (`r6`) | An input with a font size under 16px, which iOS zooms on focus. |

Copy the files into `.srcly/rules/` to use them.
