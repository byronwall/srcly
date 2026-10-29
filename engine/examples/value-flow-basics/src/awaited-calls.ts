// `await` is what the promise settles to: an async function's return arrives
// at its call, so a value handed in comes back out through the `await`.
async function measure(text: string) {
  return text.length;
}

export async function Logged(text: string) { // @trace text forward symbol text
  const size = await measure(text);
  console.log(size); // @reaches text
}
