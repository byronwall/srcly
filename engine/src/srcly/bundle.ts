// Whether this code runs from the bundle `scripts/bundle.mjs` writes. The
// bundle is one flat folder: the entry, the worker, the Python helper and a
// trimmed `node_modules/typescript`, so paths that climb out of `src/` in a
// checkout stay beside the bundle instead.
declare const __SRCLY_ENGINE_BUNDLE__: boolean | undefined;

export const IS_BUNDLE = typeof __SRCLY_ENGINE_BUNDLE__ !== "undefined" && __SRCLY_ENGINE_BUNDLE__;
