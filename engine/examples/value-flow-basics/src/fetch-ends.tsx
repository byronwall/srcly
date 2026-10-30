// A request's answer begins at the request: a value read back from a
// response has landed there, with no stop for the response body. A promise
// chain the code drops ends where it is dropped, but a dropped `map.set(k, v)`
// keeps its value in the map.
export function Titles() {
  const shown: string[] = [];
  fetch("/api/titles") // @reaches answer fetch-input
    .then((res) => res.json() as Promise<string[]>)
    .then((titles) => shown.push(...titles)); // @trace answer backward titles @outcome answer ok
  return shown;
}

export function ping(id: string) { // @trace ping forward symbol id @outcome ping ok
  fetch(`/api/ping/${id}`).then((res) => res.text()); // @reaches ping external-effect @reaches ping call "fetch(`/api/ping/${id}`).then((res) => res.text())" @stop ping network
}
