// The module `common.cjs` requires.
function slugify(text) {
  return text.toLowerCase().split(" ").join("-");
}

const config = { base: "https://example.com" };

exports.slugify = slugify;
exports.config = config;
