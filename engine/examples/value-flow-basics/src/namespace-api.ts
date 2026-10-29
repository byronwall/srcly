export const greeting = "hello";

export function shout(text: string) {
  return text.toUpperCase();
}

export function store(text: string) {
  console.log(text); // @reaches ns-call
}
