// The standard library's call adapters run a function of the project's:
// `f.call(t, a, b)` and `f.apply(t, [a, b])` hand `t` to its `this` and the
// rest to its parameters in order, and a function `f.bind(t, a)` made takes
// `a` before the arguments it is called with.
function pick(prefix, item) { // @reaches call-prefix parameter @reaches apply-prefix parameter @reaches bind-prefix parameter
  return item;
}

function self() {
  return this; // @stop bind-this unproven-handoff
}

export function called(token, other) { // @trace call-item forward symbol token @trace call-prefix forward symbol other
  return pick.call(null, other, token); // @reaches call-item return @never-reaches call-prefix return
}

export function applied(token, other) { // @trace apply-item forward symbol token @trace apply-prefix forward symbol other
  return pick.apply(null, [other, token]); // @reaches apply-item return @never-reaches apply-prefix return
}

export function bound(token, other) { // @trace bind-item forward symbol token @trace bind-prefix forward symbol other
  const later = pick.bind(null, other);
  return later(token); // @reaches bind-item return @never-reaches bind-prefix return
}

export function callThis(token) { // @trace call-this forward symbol token
  return self.call(token); // @reaches call-this return
}

// A value bound ahead (`this`, or a leading argument) enters the function,
// but its return is not paired back to the later call yet: a named limit.
export function boundThis(token) { // @trace bind-this forward symbol token
  const get = self.bind(token);
  return get();
}
