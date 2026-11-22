# Screenshot assets

`site/scripts/capture.mjs` writes every JPEG here from a real local Srcly run. Rerun it rather than editing an image.

The current set is Srcly scanning a clone of its own repository at `e4485453` (2026-11-14). The symbols and data-flow shots use the checked-in `engine/examples/symbol-graph` fixture. No private repository data appears in these images.

Each JPEG is 2160 × 1350 pixels: a 1440 × 900 viewport at 1.5x, quality 82.

- `treemap.jpg`: the whole repository, sized by LOC and colored by maximum complexity.
- `hotspots.jpg`: Hot Spots ranking files by complexity beside the treemap.
- `quadrant.jpg`: the Activity 2×2, with the Hot mess quadrant selected.
- `code-inspector.jpg`: `client/src/viz/deps/viewModel.ts`, opened on `buildViewModel`, the repository's most complex function.
- `graph.jpg`: the import graph around `client/src/viz/treemap`.
- `compare.jpg`: compare mode for commit `5a8a9c38` (symbols dead and hub overlays).
- `symbols.jpg`: Symbols mode centered on `NotePage`.
- `changes.jpg`: the Changes view over a fixed range (`e17633f` to the capture revision), with `parseLocation` selected. It was first captured with `--ref` on the Change Lens branch, before the view reached `main`.
- `data-flow.jpg`: the `/notes/[id]` trace from `NotePage`, with where it stops.
