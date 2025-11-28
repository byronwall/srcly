Need to do something about top level stuff (misc/imports)

Better progress indication would be nice - possible with websockets?

Ability to filter by file types or project types would be good in treemap

Ability to filter by folder path or a saved list of "projects" inside a monorepo would be good

Opening a file would be really nice if it showed stats for the file - recompute on open and overlay info into the display (small tooltips or overlays or something)

Should probably run on a random high port number instead of 8000

Do some sort of "extension summary" to understand what all it's trying to analyze - remove more file types

Consider showing things like file size or other meta data for binary files that are ignored (full repo explorer)

File type filter list should only show visible options (include file counts)

Export the current view using repomix - get the token count?

Backend: Dynamic port selection

Use toggle buttons instead of drop down for colors

Move color legend into comp

Need to properly get all function level metrics (not just file level) for the TSX/TS stuff

Would be really nice if the file preview included overlay/highlighting of the code that is being analyzed and when violations or counts occur (kind of like a lint)

Need to consider Solid specific stuff: `createEffect` `<Show> and <Match>`

Need to support top level constant creation in TS/TSX

Style exported elements differently - give a thick border or some other UI indicator

Large body blocks really `return <TSX>`, need to mark as such - take the top level TSX expression and make its own block -- if there are function calls inside this, then render new nodes - if just nested JSX, then render as a single block -- goal is to see the "size of refactor" if a block is yanked out

Consider some sort of "universal" color scheme which allows showing multiple things at same time -- red border = >1k LOC or something -- small mark in corner = high complexity

Provide a setting to choose the level to show - file, function, nested, etc. (pick depth within a block)

Hot spot viewer really needs to avoid showing repeated info - collect stats at the function or file level, but do not cross aggregate by default
