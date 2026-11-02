// A promise's outcomes are separate channels. A fulfilled value reaches `then`'s
// first callback and nothing else, a rejection reaches a rejection handler, and
// `finally` takes nothing and adds nothing. What `then` and `catch` callbacks
// return fulfils the new promise, and `catch` keeps the fulfilled value.
async function load(id: string) {
  return { id };
}

export function shown(id: string) { // @trace fulfilled forward symbol id @outcome fulfilled ok
  return load(id) // @reaches fulfilled return
    .then((row) => row.id) // @visits fulfilled parameter "row"
    .catch((error) => String(error)); // @never-reaches fulfilled parameter
}

export function twoHandlers(id: string, sink: (text: string) => void) { // @trace two-handlers forward symbol id
  load(id).then(
    (row) => sink(row.id), // @visits two-handlers parameter "row" @reaches two-handlers call
    (error) => sink(String(error)), // @never-reaches two-handlers parameter
  );
}

export async function replaced(id: string) { // @trace replaced forward symbol id @outcome replaced ok
  const whole = load(id);
  const value = await whole.then((row) => row.id.length);
  return value; // @reaches replaced return
}

export async function kept(id: string) { // @trace kept-field forward symbol id @outcome kept-field ok
  const value = await load(id).catch((error) => "failed"); // @trace caught forward load(id) @outcome caught ok @path caught "load(id)" "value"
  return value; // @reaches caught,kept-field return
}

export async function recovered(id: string) {
  const fallback = id + "!"; // @trace recovery forward symbol fallback @outcome recovery ok
  const value = await load(id).catch(() => ({ id: fallback })); // @visits recovery object-pack
  return value.id; // @reaches recovery return
}

export async function cleaned(id: string) {
  const note = id + "?"; // @trace finalised forward symbol note
  const value = await load(id).finally(() => note); // @reaches finalised return
  return value.id; // @never-reaches finalised
}

export async function finalisedKeeps(id: string) { // @trace final-field forward symbol id @outcome final-field ok
  const value = await load(id).finally(() => undefined); // @trace final-keeps forward load(id) @outcome final-keeps ok @path final-keeps "load(id)" "value"
  return value; // @reaches final-keeps,final-field return
}

export async function rejected(id: string) {
  const reason = id + "!"; // @trace rejection forward symbol reason @outcome rejection ok
  const value = await Promise.reject(reason).catch((error) => String(error)); // @visits rejection parameter "error"
  return value; // @reaches rejection return
}

export async function skipped(id: string) {
  const reason = id + "!"; // @trace rejection-skips forward symbol reason @outcome rejection-skips ok
  const value = await Promise.reject(reason)
    .then((row) => "fixed") // @never-reaches rejection-skips
    .finally(() => undefined)
    .catch((error) => String(error)); // @visits rejection-skips parameter "error"
  return value; // @reaches rejection-skips return
}

export async function unhandled(id: string) {
  const reason = id + "!"; // @trace unhandled forward symbol reason @outcome unhandled ok
  const value = await Promise.reject(reason); // @reaches unhandled value "reason" @never-reaches unhandled alias
  return value;
}

export async function resolved(id: string) {
  const value = await Promise.resolve(id) // @trace promise-resolved forward Promise.resolve(id) @outcome promise-resolved ok
    .catch((error) => String(error)); // @never-reaches promise-resolved parameter
  return value; // @reaches promise-resolved return
}

export async function executor(id: string) {
  const reason = id + "!"; // @trace executor forward symbol reason
  const value = await new Promise<string>((resolve, reject) => reject(reason)); // @reaches executor call
  return value; // @never-reaches executor
}

export async function caughtByTry(id: string) { // @trace in-try forward symbol id @outcome in-try ok
  try {
    const value = await load(id);
    return value.id; // @reaches in-try return
  } catch (error) {
    return String(error); // @never-reaches in-try
  }
}

export async function namedHandlers(id: string) {
  const show = (row: { id: string }) => row.id; // @visits named-handler parameter "row"
  return load(id).then(show); // @trace named-handler forward load(id) @outcome named-handler ok @reaches named-handler return
}
