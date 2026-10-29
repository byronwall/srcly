// `new Named(name)` and `super(name)` run the constructor the checker
// resolves: the argument binds its parameter. A parameter property
// (`public label`) writes its member, and a getter's return is what a read of
// its member sees. A generator's `yield x` reaches the loop over its call.
class Base {
  constructor(public label: string) {}
}

class Named extends Base {
  constructor(name: string) { // @trace super-arg forward symbol name @visits new-arg parameter "name"
    super(name);
  }
  get shout() {
    return this.label.toUpperCase(); // @visits super-arg return
  }
}

export function makeNamed(name: string) { // @trace new-arg forward symbol name
  return new Named(name).shout; // @reaches new-arg,super-arg return
}

function* items(list: string[]) {
  for (const item of list) yield item;
}

export function first(list: string[]) { // @trace yielded forward symbol list
  for (const item of items(list)) return item; // @reaches yielded return
  return null;
}
