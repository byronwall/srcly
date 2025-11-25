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

---

# New Items

Backend: Fix LOC aggregation logic (sizes wrong across large differences)

UI: Add file stats (LOC, CCN) to the Code Modal header

Backend: Use temporary directory for `codebase_mri.json`

Backend: Dynamic port selection
