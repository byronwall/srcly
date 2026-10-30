// A thrown value leaves the code it is in: it ends at the `throw`, whether
// it is an error built from the value or the value itself. An error that is
// built and returned instead is an ordinary value: it carries on.
export function parseCount(text: string): number { // @trace parse-text forward text
  const count = Number(text);
  if (Number.isNaN(count)) throw new Error(`Not a number: ${text}`); // @reaches parse-text call "Number.isNaN(count)" @reaches parse-text call "new Error(`Not a number: ${text}`)"
  return count; // @reaches parse-text return
}

export function failWith(message: string): never { // @trace fail-message forward message @outcome fail-message ok
  throw message; // @reaches fail-message value "message"
}

export function errorFor(message: string): Error { // @trace error-message forward message
  return new Error(message); // @reaches error-message return
}
