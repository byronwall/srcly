// A promise's outcomes are separate channels in plain JavaScript too: the
// checker infers the same `Promise` members from an `async function`.
async function load(id) {
  return { id };
}

export function handled(id) { // @trace js-fulfilled forward symbol id @outcome js-fulfilled ok
  return load(id) // @reaches js-fulfilled return
    .then((row) => row.id) // @visits js-fulfilled parameter "row"
    .catch((error) => String(error)); // @never-reaches js-fulfilled parameter
}

export async function cleaned(id) {
  const note = id + "?"; // @trace js-finally forward symbol note
  const value = await load(id).finally(() => note); // @reaches js-finally return
  return value.id; // @never-reaches js-finally
}
