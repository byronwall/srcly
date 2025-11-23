# All Prompts Used

## Create Python server

> Convert the single python file over to a full server with API.  It should do the static analysis on the current host using absolute file paths.  It should cache the results to disk and then serve them via API.  It should also provide a set of endpoints to get the raw file contents to be viewable in the front end.  Create a README that documents all of its operation.  Do something to make it easy for the client to consume types automatically (or via code gen).  Do eveyrthing using uv and modern python project stuff.

## Create client

> Go ahead and implement the client.  Do a single page app using SolidJS, tailwind, bare fetch calls for now.  Use a dev server that includes vite and proxying to the python server.  Update the main server to support static build files.  End goal is a single `uv run` tool type call that can kick off teh server which serves teh built client.  Do all that in one go here.

## Implement viz

> Implement the full treemap visuals from @code-viz.html into the main solid app.  Get it all working end to end.  Offer a file picker in the client to make it easy to find the file.  Have the server convey available folders based on the current input.  Make it a nice auto suggest thing which goes a folder at a time.
