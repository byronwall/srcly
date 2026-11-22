// Everyday patterns of plain JavaScript modules: untyped values, prototypes, callbacks and module state.
import { EventEmitter } from "node:events";

// J4 a prototype method reads what the constructor stored
function Account(owner) {
  this.owner = owner;
}
Account.prototype.describe = function () {
  return `account of ${this.owner}`;
};
export function openAccount(owner) {
  // @trace js-prototype forward owner @want return
  const account = new Account(owner);
  return account.describe();
}

// J5 a class with a method and a field
class Basket {
  constructor() {
    this.items = [];
  }
  add(item) {
    this.items.push(item);
  }
  list() {
    return this.items;
  }
}
export function fill(item) {
  const basket = new Basket();
  // @trace js-class forward item @want return
  basket.add(item);
  return basket.list();
}

// J6 a callback the caller hands in
function each(list, visit) {
  for (const entry of list) visit(entry);
}
export function printAll(names) {
  // @trace js-callback forward names @want stdout
  each(names, (name) => console.log(name));
}

// J7 `arguments`
function joinAll() {
  return Array.prototype.slice.call(arguments).join(", ");
}
export function joined(first, second) {
  // @trace js-arguments forward second @want return
  return joinAll(first, second);
}

// J8 a JSDoc-typed object
/**
 * @param {{ title: string, done: boolean }} todo
 * @returns {string}
 */
export function describeTodo(todo) {
  // @trace js-jsdoc forward todo @want return
  return todo.done ? `done: ${todo.title}` : todo.title;
}

// J9 an untyped options object with defaults
export function connect(options) {
  // @trace js-options forward options @want external-effect
  const { host = "localhost", port = 80 } = options || {};
  return fetch(`http://${host}:${port}/health`);
}

// J10 a dynamic key
export function setField(record, key, value) {
  // @trace js-dynamic-key forward value @want return
  record[key] = value;
  return record;
}

// J11 an event emitter
const bus = new EventEmitter();
bus.on("saved", (payload) => console.log(payload.id));
export function announce(id) {
  // @trace js-emitter forward id @want stdout
  bus.emit("saved", { id });
}

// J12 a promise chain
export function loadTitle(url) {
  // @trace js-promise-chain forward url @want external-effect
  return fetch(url)
    .then((response) => response.json())
    .then((body) => body.title)
    .catch(() => "untitled");
}

// J13 async and await over an untyped response
export async function loadNames(url) {
  const response = await fetch(url);
  const rows = await response.json();
  // @trace js-await backward rows.map((row) => row.name) @want fetch-input
  return rows.map((row) => row.name);
}

// J14 a closure over module state
let counter = 0;
export function nextId(prefix) {
  counter += 1;
  // @trace js-module-counter forward prefix @want return
  return `${prefix}-${counter}`;
}
const registry = new Map();
export function register(name, handler) {
  // @trace js-module-map forward handler @want return
  registry.set(name, handler);
}
export function lookup(name) {
  return registry.get(name);
}

// J15 a factory that returns closures
function makeCounter(start) {
  let value = start;
  return {
    bump(step) {
      value += step;
      return value;
    },
  };
}
export function bumped(step) {
  // @trace js-closure-factory forward step @want return
  return makeCounter(0).bump(step);
}

// J16 spread and rest
export function merge(base, ...patches) {
  // @trace js-rest-spread forward patches @want return
  return patches.reduce((result, patch) => ({ ...result, ...patch }), base);
}

// J17 optional chaining and a default
export function cityOf(user) {
  // @trace js-optional-chain forward user @want return
  return user?.address?.city ?? "unknown";
}

// J18 JSON in and out
export function roundTrip(text) {
  // @trace js-json forward text @want return
  const parsed = JSON.parse(text);
  return JSON.stringify({ ...parsed, seen: true });
}
