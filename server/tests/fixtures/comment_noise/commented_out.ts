export function loadUser(id: string) {
  const url = `/api/users/${id}`;
  // const cached = cache.get(url);
  // if (cached) {
  //   return cached;
  // }
  return fetch(url).then((r) => r.json());
}

// These three lines are prose about the function below,
// written as an ordinary explanation that does not parse,
// so they are not flagged as commented-out code.
export function saveUser(user: { id: string }) {
  // eslint-disable-next-line no-console
  // eslint-disable-next-line no-debugger
  // eslint-disable-next-line no-alert
  return fetch(`/api/users/${user.id}`, { method: "PUT" });
}
