The treemap grouping and sizing is not correct - get a very simple example and force it to work -- sizes are wrong across large differences in LOC

Need to do something about top level stuff (misc/imports)

Need to include the line and column numbers for showing chunks of files

Implement the lenses to start showing stats beyond LOC and CCN

Better progress indication would be nice - possible with websockets?

Ability to filter by file types or project types would be good in treemap

Ability to filter by folder path or a saved list of "projects" inside a monorepo would be good

Opening a file would be really nice if it showed stats for the file - recompute on open and overlay info into the display (small tooltips or overlays or something)

Avoid saving the codebase_mri to common folder - put into a temp place instead

Should probably run on a random high port number instead of 8000

Do some sort of "extension summary" to understand what all it's trying to analyze - remove more file types

Consider showing things like file size or other meta data for binary files that are ignored (full repo explorer)

Need an expand all on the filter sidebar (folder tree)... not sure how useful the filtering is -- need to show highlight, maybe support fuzzy

File type filter list should only show visible options (include file counts)

Modal to close on outside click

Export the current view using repomix - get the token count?

---

Backend: Dynamic port selection

Remove top level root item from the Treemap (just start with children, save 1 level of nesting)

Use toggle buttons instead of drop down for colors

Move color legend into comp
