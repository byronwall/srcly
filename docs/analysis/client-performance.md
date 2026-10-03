# Client performance changes

This note records the large-tree changes and their limits. The benchmark uses a synthetic tree. Its timings are Node compute measurements, not browser interaction or paint measurements.

## Changes

App search and hide state now share one immutable tree traversal in `client/src/utils/dataProcessing.ts`. It returns the original tree when no filters apply. With filters, it copies only changed ancestors. This removes App's full `JSON.stringify`/`JSON.parse` copy and a second hide traversal. The Explorer and treemap receive the same filtered view. The Explorer stays mounted when a search has no matches, so the user can clear the search.

The Explorer now flattens the expanded tree into sorted rows and renders a fixed-height virtual window. It keeps the existing sort fields, metric columns, hotspot view, hide controls, zoom, and expand actions. Arrow keys, Home, End, Enter, and Space work on focused tree rows. A filtered tree still expands its matching paths. The keyboard handler ignores Enter and Space from child buttons.

The treemap uses one DPR-aware canvas for tiles. A spatial hit index supports pointer input. Keyboard input can select and activate tiles. Very small tiles are culled. Scope-body preparation shares unchanged nodes and arrays. The canvas decision and its known tradeoffs are below.

The dependency graph uses a real ELK worker for layered layout. Its D3 force simulation also runs in a dedicated worker. New force layouts stop the prior force worker. A shared generation token drops stale results from layered or force layout. The CodeModal is conditionally lazy-loaded. Shiki runs in a worker, loads only the grammar selected for the file, and ignores stale results. A worker keeps one active request and replaces queued requests with the latest selection.

## Measurements

`client/scripts/performance-benchmark.mjs` builds the same 20,601-node and 51,601-node fixtures for both paths. It uses three warmups and five measured runs. The old path clones the tree, removes excluded nodes, and searches. The new path combines exclusions and search in one immutable traversal. The treemap comparison includes cloning, filtering, synthetic body nodes, hierarchy creation, and D3 layout.

| Fixture | App clone + filter | Immutable combined filter | Old treemap pipeline | Current treemap pipeline | Explorer flatten, all expanded | Tree rows in virtual window |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20,601 nodes | 21.61 ms | 1.00 ms | 29.48 ms | 10.32 ms | 7.23 ms | 36 |
| 51,601 nodes | 68.23 ms | 3.07 ms | 123.59 ms | 48.82 ms | 9.33 ms | 36 |

The two filtering paths returned the same 201 nodes. Treemap layouts contained 23,194 and 58,194 hierarchy nodes. The numbers show CPU time in Node 22.21.1 on this host. They do not show browser paint time, input delay, or memory use. The virtual row count is structural: the sample viewport requested 640 pixels at 32 pixels per row with overscan. It is not a browser DOM measurement.

These figures come from an independent confirmation run during browser verification. Machine load changes the absolute times. An earlier paired run measured filtering at 46.97 → 2.14 ms for 51,601 nodes. That run measured treemap preparation at 66.09 → 20.28 ms. Both runs show the same direction of improvement. Neither run establishes a browser latency limit.

The original stack head emitted 2,046.80 kB JavaScript, or 633.73 kB gzip, for the main entry. The removal PR reduced that to 2,004.55 kB, or 620.84 kB gzip. This performance PR emits a 165.67 kB entry, or 56.52 kB gzip.

The graph and CodeModal load as separate chunks: 39.89 kB and 179.35 kB. Their gzip sizes are 14.84 kB and 55.78 kB. Worker output is separate: ELK is 1,613.73 kB, Shiki is 114.11 kB, and force layout is 48.44 kB. ELK and Shiki workers load when their views open. These sizes confirm code splitting. They do not measure network time or decompression cost.

To reproduce the compute run:

```sh
cd client
pnpm exec node --experimental-strip-types scripts/performance-benchmark.mjs
```

The script writes `tmp/client-performance-candidate.json` at the repository root. The old algorithms are included in the script. It does not depend on temporary baseline files.

To serve a production build with the large browser fixture:

```sh
cd client
pnpm build
pnpm exec node scripts/perf-preview.mjs --port=8102 --dist=dist
```

Analyze the offered `/srcly-performance-fixture` folder. It contains 25,975 nodes, 2,268 files, 23,562 function scopes, and 141,498 LOC. The fixture includes TypeScript source and Markdown content. It simulates completed scans and serves static assets. Use the real API server to test dependency graphs. Pass a saved build directory through `--dist` to compare another revision.

## Treemap renderer choice

Scores below are estimates from the implementation and interaction shape. They are not measured results. A higher score is better. The dimensions apply to the treemap and its dense-tree interaction. The Explorer is virtualized in all choices.

| Renderer | DOM pressure | Dense-tree navigation latency | Readability | Keyboard access |
| --- | ---: | ---: | ---: | ---: |
| Canvas tiles | 10 | 8 | 8 | 8 |
| Improved SVG | 3 | 4 | 9 | 9 |
| Bounded canvas/SVG hybrid | 7 | 7 | 9 | 8 |

Canvas keeps tile count out of the DOM and avoids per-tile transitions. It needs explicit hit testing, focus state, and keyboard behavior. Its text is not native selectable SVG text. The existing accessible Explorer remains the semantic, keyboard-friendly tree view. SVG offers native text and element inspection, but every visible tile adds DOM and rendering work. A hybrid can keep a small number of labels in SVG, but it adds a second coordinate system and hit-test rules. Current evidence does not justify that extra path.

## Limits and next checks

The browser has not measured first paint, memory, scroll latency, or canvas redraw time. D3 hierarchy and treemap layout still run on the main thread. The force worker returns final positions after 260 simulation ticks, so it does not animate intermediate states. Graph worker startup and serialization have costs for small graphs. The benchmark does not measure these browser costs.

Use the local large-tree browser fixture to compare scroll, search, treemap hover, and graph layout on the integrated build. Keep any change only if those checks show a useful improvement without loss of reading, keyboard, or selection behavior.
