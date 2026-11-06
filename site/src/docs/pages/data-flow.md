# Data-flow analysis

Data flow traces how values move through supported source code. Use it to investigate where a request is handled, what a function does with an input, or where a value is written or returned. It is a separate feature from the TypeScript and TSX import dependency graph.

## Open a trace

In the app, switch to **Data flow** from a selected file or function. Choose an anchor, such as a route, exported function, or file. Depending on the anchor and language, Srcly can show a route, a value-flow trace, or function effects. Select a graph item to inspect its source location and relations.

For a repository summary or an agent workflow, use the headless commands first:

```bash
uvx srcly report . --out .srcly
uvx srcly explain . --at src/app.tsx
```

The data-flow graph is currently an interactive app view; the headless examples above provide general scan and scope context.

## Requirements and language support

The bundled engine requires Node.js 18 or newer on `PATH`. Set `SRCLY_NODE` if you need to select a specific Node executable. If Node or the engine is unavailable, Srcly names the reason and keeps the rest of the scan available.

The engine analyzes TypeScript, JavaScript, and Python roots. TypeScript and JavaScript projects are detected from project configuration or source files. Python projects are detected from Python project files or `.py` files. Loose TypeScript or JavaScript files can also be analyzed. Without project type configuration, some guarantees about null values are unavailable.

Python analysis has a different feature set from TypeScript. Python routes can open their handler in anchor mode; the TypeScript route graph does not apply to Python. Unsupported constructs or incomplete evidence can stop a trace early.

## Read outcomes honestly

Trace results name their outcome. A result can be complete, partial, stale, or not analyzed, with a reason where applicable. A partial result may include an assumed relationship or an unmodeled handoff. Do not treat an empty graph or a missing edge as proof that a value cannot flow.

The engine models selected language constructs and libraries; it is not a whole-program proof. Coverage depends on the code, available project configuration, and the models Srcly supports. Review the trace's assumptions and source locations, then verify important conclusions in the code and tests.

See [Explore](../explore/) for the related views and [Configuration](../configuration/) for choosing the Node executable.
