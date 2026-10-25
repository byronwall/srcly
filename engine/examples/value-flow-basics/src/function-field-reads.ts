// A plain function's caller binds the whole argument, not each field: the
// reads of `input` (`input.name`, `input.tags.length`) come from the object
// the caller passes, so they land through the parameter. Only a component's
// props are bound one by one.
export function describeItem(input: { name: string; tags: string[] }) {
  return `${input.name.trim()} (${input.tags.length})`;
}

export function describeFirst() {
  return describeItem({ name: "first", tags: ["a"] });
}
