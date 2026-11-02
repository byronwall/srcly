// Everyday patterns in actual JavaScript: the same shapes as `vanilla`, in a `.js` file.

function label(person) {
  return `${person.first} ${person.last}`;
}

export function greet(person) {
  // @trace js-template forward person @want stdout
  console.log(label(person));
}

export function total(items) {
  // @trace js-reduce forward items @want return
  return items.reduce((sum, item) => sum + item.price, 0);
}

export function collect(rows, extra) {
  const kept = [];
  // @trace js-push forward extra @want return
  kept.push(extra);
  return kept.concat(rows);
}
