// No config at all: the Program comes from the files here and the inferred options.
function tag(text) {
  return `#${text}`;
}

export function shown(name) { // @trace bare-call forward symbol name @outcome bare-call ok
  const tagged = tag(name);
  console.log(tagged); // @reaches bare-call stdout @reaches bare-call external-effect
}

export async function loaded(id) { // @trace bare-promise forward symbol id @outcome bare-promise ok
  const value = await Promise.resolve(id)
    .then((row) => row) // @visits bare-promise parameter "row"
    .catch((error) => String(error)); // @never-reaches bare-promise parameter
  return value; // @reaches bare-promise return
}
