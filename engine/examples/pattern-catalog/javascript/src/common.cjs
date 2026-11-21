// CommonJS: `require` and `module.exports`.
const { slugify, config } = require("./lib.cjs");

function titleSlug(title) {
  // @trace js-require forward title @want return
  return slugify(title);
}

function baseUrl() {
  // @trace js-require-value backward config.base @want literal
  return config.base;
}

module.exports = { titleSlug, baseUrl };
