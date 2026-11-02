// Plain JavaScript under a jsconfig with `strictNullChecks` off: the call pairs as it does in a strict project.
function tag(text) {
  return `#${text}`;
}

export function shown(name) { // @trace loose-call forward symbol name @outcome loose-call ok
  const tagged = tag(name);
  console.log(tagged); // @reaches loose-call stdout @reaches loose-call external-effect
  return 0; // @never-reaches loose-call
}
