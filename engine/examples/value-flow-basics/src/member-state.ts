// A value kept in a member the program declares is read wherever that member
// is: `this.title = …` in one method reaches `this.title` in another, what
// `this.items.set(…)` puts in reaches `this.items.get(…)`, and a write two
// fields deep (`state.card.label = …`) reaches reads of that field.
class Cache {
  private title = "";
  private items = new Map<string, string>();
  remember(title: string) {
    this.title = title;
  }
  put(key: string, value: string) {
    this.items.set(key, value);
  }
  recall() {
    return this.title;
  }
  get(key: string) {
    return this.items.get(key);
  }
}

const state = { card: { label: "" } };

export function useCache(title: string, value: string, label: string) { // @trace member-title forward symbol title @trace member-item forward symbol value @trace member-deep forward symbol label
  const cache = new Cache();
  cache.remember(title);
  cache.put("k", value);
  state.card.label = label;
  console.log(cache.recall()); // @reaches member-title
  console.log(cache.get("k")); // @reaches member-item
  console.log(state.card.label); // @reaches member-deep
}
