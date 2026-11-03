// A standard callback's parameters take the roles the method gives them
// (element, index, accumulator), and a return the method ignores or only
// tests carries nothing out. A class's own `forEach` is not the standard one.
export function mapped(token) {
  const rows = [token]; // @trace cb-map forward token
  const ids = rows.map((row) => row.id);
  return ids; // @reaches cb-map return
}

export function indexOnly(token) {
  const rows = [token]; // @trace cb-index forward token
  // The index takes a position, not the element. The call's value still comes from `rows.map` itself.
  const places = rows.map((row, index) => index); // @reaches cb-index parameter @no-path cb-index "row" "index"
  return places; // @reaches cb-index return @no-edge cb-index return-value *
}

export function eachIgnored(token) {
  const rows = [1, 2];
  const done = rows.forEach(() => token); // @trace cb-each forward token @reaches cb-each return
  return done; // @never-reaches cb-each
}

export function filterTests(token) {
  const rows = [1, 2];
  const kept = rows.filter(() => token); // @trace cb-filter-test forward token @reaches cb-filter-test return
  return kept; // @never-reaches cb-filter-test
}

export function filterKeeps(token) {
  const rows = [token]; // @trace cb-filter forward token
  const kept = rows.filter((row) => row.ok); // @visits cb-filter parameter @reaches cb-filter return
  return kept; // @reaches cb-filter return
}

export function findKeeps(token) {
  const rows = [token]; // @trace cb-find forward token
  const hit = rows.find((row, index) => index > 0); // @reaches cb-find parameter @no-path cb-find "token" "index"
  return hit; // @reaches cb-find return
}

export function reduced(seed) { // @trace cb-reduce forward symbol seed
  const rows = [{ n: 1 }];
  const total = rows.reduce((sum, row) => [sum, row.n], seed);
  return total; // @reaches cb-reduce return @edge cb-reduce callback-parameter proven standard-library
}

export function sortedConstant(token) {
  const rows = [1, 2];
  const sorted = rows.sort(() => token); // @trace cb-sort forward token @reaches cb-sort return
  return sorted; // @never-reaches cb-sort
}

class Rows {
  forEach(fn) {
    return fn(1);
  }
}

export function ownForEach(token) {
  const rows = new Rows();
  const back = rows.forEach(() => token); // @trace cb-own forward token
  return back; // @reaches cb-own return
}
