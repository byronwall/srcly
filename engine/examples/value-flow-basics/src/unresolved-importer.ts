import shared from "./unresolved-export";

export function bump() {
  Object.assign(shared, { k: "NEW" });
}
