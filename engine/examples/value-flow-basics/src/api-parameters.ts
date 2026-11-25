// A parameter of an exported function that nothing in the program calls
// begins at the module's API: its caller is outside the program, as a value
// handed to such a function ends at its export. A function the module keeps
// to itself, which nothing calls, has no caller anywhere: its parameter stays
// a stop.
export function greet(name: string) { // @visits api-param parameter
  const text = `hi ${name}`;
  return text; // @trace api-param backward text @outcome api-param ok
}

function hidden(name: string) { // @stop hidden-param untraced parameter
  const text = `hi ${name}`;
  return text; // @trace hidden-param backward text @outcome hidden-param partial
}
export const keep = [hidden];
