# Change Lens: contract

Source: [#397](https://github.com/byronwall/srcly/issues/397). This file is temporary. The last PR of the stack moves its lasting facts into `docs/CODE_MAP.md` and the site docs, and removes this folder.

Change Lens answers three questions after a coding session: where the work happened, what changed in the shape of the code, and what to review first. A window changes which code is visible.

The payload types are in `client/src/changelens/types.ts`. That file is the contract. The server's Pydantic models mirror it with camelCase aliases.

## Endpoints

### `GET /api/change-lens`

| Param | Values | Default |
| --- | --- | --- |
| `path` | Absolute path of the analyzed folder (the scan root) | required |
| `window` | `branch`, `24h`, `7d`, `custom` | `branch` |
| `mode` | `touched`, `net` | `touched` |
| `ref` | Branch or revision whose history is read | `HEAD` |
| `base`, `head` | Revisions, for `custom` | none |
| `since`, `until` | ISO 8601 times, for `custom` | none |
| `worktree` | `1` or `0`: include staged and unstaged edits | `1` when `ref` is `HEAD` |

Returns `ChangeLensPayload`. A folder that is not a git repo returns 409 with a reason. An empty window returns 200 with empty lists and a note.

Every `path` in the payload is relative to `selection.repoRoot`. When `path` is a folder inside the repo, only files below it are read, and a note says so.

### `GET /api/change-lens/hunk`

`path`, the same selection params, `chunk` (a chunk id), and an optional `commit` (a sha or `WORKTREE`). Returns `LensHunkDiff`. Without `commit`, the diff runs from the selection's base to its head. With `commit`, it runs from that commit's first parent to the commit.

The diff holds only the chunk's own lines. A symbol's diff compares its body on the two sides, so a moved symbol shows only what changed in it. A `file` chunk's diff leaves out the lines inside named scopes. An unknown chunk id returns 404.

### `srcly changes [path]`

Prints the same result as Markdown: the resolved selection, the review buckets, then the chunks grouped by folder, with `before → after` complexity. Flags: `--window`, `--mode`, `--ref`, `--base`, `--head`, `--since`, `--until`, `--no-worktree`, `--json`.

## Time rules

1. **One history.** Read `git log --first-parent <ref>`. A merge commit counts once, as its diff against its first parent. Activity from other branches never mixes in. Say this in `selection.notes` when the window holds a merge. A merge of the default branch into a feature branch is listed, but its diff is not read: those are upstream changes. A note names it. A merge that is itself on the default branch (a merged PR) is never an upstream merge. When the base is older than such a merge (a time window), "before" is the base with the merge's own diff applied, so neither mode counts what the merge brought in. If that diff overlaps the branch's own edits and cannot be applied, the base stays as it is and a note says so.
2. **Branch window.** Base is the merge-base of `ref` and the default branch, found the way `compare/git_refs.py` (`resolve_auto_base`) finds it. Head is `ref`. On the default branch itself, the base is the upstream tip (`origin/<default>`); when that equals head, the window is empty and a note says so.
3. **Time windows.** Commits whose committer date is inside `[since, until]`. Base is the first parent of the oldest commit in the window. Head is the newest. `24h` and `7d` count back from now.
4. **Working tree.** Staged and unstaged edits are one entry, `WORKTREE`, after the last commit. It has no time. Untracked files count as added, unless srcly's ignore rules skip them. The entry exists only when the tree holds edits; then `selection.head` is the working tree.
5. **Touched against net.** Touched is the union of chunks that any commit in the window changed. Net compares the base snapshot with the head snapshot (the working tree, when included). A chunk that was changed and then put back has status `reverted` in touched mode and is absent in net mode.
6. **Shallow or incomplete history.** State it in `selection.notes`. Never guess a base. A window never reads past the oldest commit a shallow clone holds.
7. **Long windows.** A window keeps its newest 200 commits. The base moves to the parent of the oldest one kept, and a note says so.
8. **Files left out.** Binary files and files that srcly's ignore rules skip (lockfiles, `.json`, images) are not in the payload. A note gives their count.

## Chunk rules

1. Parse each changed file once per side (base and head) with the analyzer the scan uses for it. Parse the blob (`git show <sha>:<path>`), not a checkout. Do not scan whole snapshots.
2. A hunk belongs to the innermost named scope that holds its lines: on the new side for added and changed lines, on the old side for deleted lines. Executable scopes win over display scopes. A callback with no name belongs to the named scope around it. A nested named scope has a qualified name (`Outer.inner`, `Class.method`). Comment and decorator lines right above a scope belong to it.
3. Hunks outside every scope form one `file` chunk for that file. In Markdown, a hunk belongs to its nearest heading section (`heading`). In a file no analyzer reads (YAML, CSS, shell), hunks within 10 lines of each other form one `range` chunk; when such a file is added or deleted, it is one `file` chunk. A generated or vendored file is one `file` chunk and is not analyzed.
4. Never invent a symbol. A chunk with no analyzer has `measured: false`, an empty `metrics`, and a `naReason`. So do `heading` chunks and `file` chunks: no code metric applies to them.
5. Pair head and base chunks by path and qualified name (`exact`). When git reports a rename, pair by qualified name across the two paths (`renamed-file`). A symbol that left one file and appeared in another with a near-identical body is `moved` (same name, 90% of body lines equal). A line-number overlap alone is never a match. A weaker guess is `uncertain`: the same name with 60% to 90% equal, or a new name on an unchanged body in the same file. Unpaired chunks are `added` or `deleted`.
6. A pure rename with an unchanged body has equal `before` and `after`. It is not an improvement or a regression. A file renamed with no edit is one `file` chunk with status `moved`, no changed lines, and file-level metrics (`loc`, max `complexity`) that are equal on both sides.
7. Deleted chunks stay in touched mode, with their base lines. A symbol added and removed inside the window is `reverted`, with no metrics.
8. Touches come from mapping each commit's hunks to the chunk through the file's symbols at that commit. `touches.length` is the number of commits that changed the chunk.
9. Use one analysis version for both sides.

## Review buckets

Buckets are plain rules. There is no single score.

- `complex-and-changed`: the chunk existed at base with cyclomatic complexity of 10 or more, and its body changed.
- `new-hotspot`: the chunk is `added`, or its complexity rose, and its complexity at head is 10 or more.

Test, docs, generated and vendor files get no bucket. The thresholds are constants in one place.

## Client view

Change Lens is the fourth view: `?view=changes`, beside Treemap, Graph and 2x2. Its code is in `client/src/changelens/`. URL params: `cw` (window), `cm` (mode), `cl` (layout: `edits` or `repo`), `cc` (selected commit), `cs` (selected chunk id), `cbase`, `chead`, `csince`, `cuntil`.

- **Window bar** (in the view toolbar slot): the four presets, the Touched/Net switch, the Only edits/Show in repo switch. Below it, one status line shows the resolved base and head, the time limits and time zone, and each note.
- **Only edits:** a packed treemap of chunks grouped by folder, then file. Area is changed lines (`added + deleted`), with a floor so each chunk can be clicked. Folder labels read like `5 edited / 43 files · mostly tests`. Breadcrumbs and collapsible groups stay.
- **Show in repo:** the file map with area by file LOC. Untouched files are muted. Edited chunks keep an outline.
- **Lenses:** the color picker gains "Complexity delta" (a diverging scale) beside the current metrics. Added, deleted, moved, reverted and not-measured each have their own state, never a zero. A color change never changes the layout or the selection.
- **Panel** (`client/src/changelens/panel/`): `ReviewBuckets`, `ChunkInspector` (before → after for each metric, the touch strip, churn against net), `HunkDiff`, `CommitRail`.

Panel components take data through props only. They do not fetch, and they do not read the navigation store. The view owns state and passes it in:

```ts
// client/src/changelens/panel/index.ts
ReviewBuckets(props: { payload: ChangeLensPayload; selected: string | null; onSelect: (chunkId: string) => void })
ChunkInspector(props: { payload: ChangeLensPayload; chunk: LensChunk | null; onOpenHunk: (chunkId: string, commit?: string) => void; onOpenCode: (chunk: LensChunk) => void })
HunkDiff(props: { diff: LensHunkDiff | null; loading: boolean; error?: string; onClose: () => void })
CommitRail(props: { commits: LensCommit[]; selected: string | null; onSelect: (sha: string | null) => void; highlightChunk?: string | null })
```

## Acceptance fixture

`server/tests/fixtures/change_lens_repo.py` builds a small git repo in a temp folder, with fixed commit dates. Its branch holds: one edit to one function in a large file; three edits to the same function; a change that a later commit reverts; a pure file rename; a deleted function; a config hunk and a Markdown hunk; a new function with high complexity; and an uncommitted edit.

The tests and the browser proof check that:

- Only edits hides untouched chunks, keeps breadcrumbs, and opens the right diff.
- Reverted work shows in Touched and not in Net. The pure rename reports no complexity change.
- A color change keeps layout and selection. A switch to Show in repo keeps the selection.
- Before → after values come from the same analysis inputs. Unsupported metrics and unresolved matches say so.
- The UI never names an agent as the author of a read or an edit.
