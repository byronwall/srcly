// Whether a native method changes its receiver is the method's doing, never a
// result of what the caller does with its value. `push` keeps its argument with
// the value used; `concat` keeps nothing with the value dropped.
export function retainedPush(token) {
  const mutated = [];
  const length = mutated.push(token); // @trace js-push forward token @path js-push "token" "length"
  console.log(length); // @reaches js-push stdout @reaches js-push external-effect
  return mutated; // @reaches js-push return
}

export function droppedConcat(token) {
  const kept = [];
  kept.concat([token]); // @trace js-concat-dropped forward token @reaches js-concat-dropped call
  return kept; // @never-reaches js-concat-dropped
}

export function keptConcat(token) {
  const kept = [];
  const copied = kept.concat([token]); // @trace js-concat-kept forward token
  console.log(kept); // @never-reaches js-concat-kept
  return copied; // @reaches js-concat-kept return
}

export function retainedSet(key, value) {
  const seen = new Map();
  const same = seen.set(key, value); // @trace js-map-set forward value
  console.log(same); // @reaches js-map-set stdout @reaches js-map-set external-effect
  return seen; // @reaches js-map-set return
}

class Stack {
  push(item) {
    return item;
  }
}

export function ownPush(token) {
  const stack = new Stack();
  const back = stack.push(token); // @trace js-own-push forward token
  console.log(back); // @reaches js-own-push stdout @reaches js-own-push external-effect
  return stack; // @never-reaches js-own-push
}
