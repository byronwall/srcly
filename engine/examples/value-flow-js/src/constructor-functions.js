// A constructor function and its prototype methods. `new Account(owner)` runs
// `Account`, which keeps `owner` in a member; a method assigned to
// `Account.prototype` is entered by its call and reads that member back.
function Account(owner, region) {
  this.owner = owner;
  this.region = region; // @stop js-proto-unread disconnected
}
Account.prototype.describe = function () {
  return `account of ${this.owner}`; // @path js-proto-method "owner" "`account of ${this.owner}`"
};

export function openAccount(owner) {
  const account = new Account(owner, "eu"); // @trace js-proto-method forward owner @outcome js-proto-method ok
  return account.describe(); // @reaches js-proto-method return
}

// `region` is kept but nothing reads it back: its trace stops at the member.
// A member is the constructor's, not one object's, so `owner` above reaches this `describe()` too.
export function openRegion(region) {
  const account = new Account("someone", region); // @trace js-proto-unread forward region @outcome js-proto-unread partial
  return account.describe(); // @never-reaches js-proto-unread @reaches js-proto-method return
}

// A constructor function's own return is not what `new` yields.
function Tagged(label) {
  this.label = label;
  return 1;
}
Tagged.prototype.read = function () {
  return this.label;
};

export function makeTagged(label) {
  const tagged = new Tagged(label); // @trace js-proto-label forward label @outcome js-proto-label ok
  return tagged.read(); // @reaches js-proto-label return
}
