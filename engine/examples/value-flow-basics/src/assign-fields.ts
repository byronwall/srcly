// `Object.assign(target, ...sources)` keeps each source's fields under their
// own names, as a spread does: a value put in `a` is read from `.a`, never `.b`.
export function assigned(kval: string) {
  const merged = Object.assign({}, { a: kval }, { b: "z" }); // @trace assign-k forward kval
  console.log(merged.a); // @reaches assign-k
  console.warn(merged.b); // @never-reaches assign-k field-read
}

export function spread(sval: string) {
  const merged = { ...{ a: sval }, ...{ b: "z" } }; // @trace spread-s forward sval
  console.log(merged.a); // @reaches spread-s
  console.warn(merged.b); // @never-reaches spread-s field-read
}
