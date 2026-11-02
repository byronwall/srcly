// CommonJS: `esm-entry.mjs` calls this through `require`.
function shout(text) {
  return text.toUpperCase(); // @stop js-mjs unresolved-symbol
}

module.exports = { shout };
