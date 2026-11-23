// Original, dependency-free semantic controls for the Srcly research mission.
// These execute JavaScript semantics only. They do not execute or test Srcly.
// Run: pnpm exec node native-controls.mjs > native-observations.json
import assert from 'node:assert/strict';

const records = [];
const record = (id, assertions, actual) => {
  records.push({ id, status: 'passed', assertions, actual });
  console.error(`[native-control] ${id}: ${assertions.length} assertions passed`);
};

const token = { id: 'T' };
const other = { id: 'OTHER' };

// N01: a new container can preserve element identity without aliasing its input.
const source = [];
const copied = source.concat([token]);
assert.equal(source.length, 0);
assert.notEqual(copied, source);
assert.equal(copied[0], token);
source.concat([other]); // Discarding a return does not make concat mutate.
assert.equal(source.length, 0);
record('N01', ['source remains empty', 'concat returns a different array', 'copied element is token by reference', 'discarded concat still does not mutate'], {
  sourceLength: source.length, sameContainer: copied === source, sameElement: copied[0] === token,
});

// N02: consuming a mutator's result does not suppress its receiver mutation.
const target = [];
const length = target.push(token);
assert.equal(length, 1);
assert.equal(target[0], token);
record('N02', ['used push result is length 1', 'receiver holds the identical token'], {
  result: length, receiverLength: target.length, sameElement: target[0] === token,
});

// N03: element, index and array are distinct callback channels.
const input = [10, 20];
const seen = input.map((value, index, array) => [value, index, array === input]);
assert.deepEqual(seen, [[10, 0, true], [20, 1, true]]);
const ignored = input.forEach(() => token);
assert.equal(ignored, undefined);
const sortable = [20, 10];
const sorted = sortable.sort((a, b) => a - b);
assert.equal(sorted, sortable);
assert.deepEqual(sorted, [10, 20]);
record('N03', ['map binds element/index/original array separately', 'forEach returns undefined', 'sort returns its receiver', 'sort comparator controls order'], {
  mapArguments: seen, forEachResult: { type: 'undefined' }, sortSameReceiver: sorted === sortable, sorted,
});

// N04: fulfillment, rejection, finalization and callback returns are separate.
const events = [];
const originalPromise = Promise.resolve(token);
const finalizedPromise = originalPromise.finally(() => { events.push('finally'); return other; });
assert.notEqual(finalizedPromise, originalPromise);
assert.equal(await finalizedPromise, token);
const mapped = await Promise.resolve(token).then(() => other);
assert.equal(mapped, other);
let thrownReason;
try { await Promise.resolve(token).finally(() => { throw other; }); }
catch (error) { thrownReason = error; }
assert.equal(thrownReason, other);
let rejectFulfilled = 0;
let rejectReason;
await new Promise((_resolve, reject) => reject(other)).then(
  () => { rejectFulfilled++; },
  (reason) => { rejectReason = reason; events.push('rejected'); },
);
assert.equal(rejectFulfilled, 0);
assert.equal(rejectReason, other);
record('N04', ['finally returns a distinct promise', 'normal finally return is ignored for fulfillment payload', 'then callback return becomes fulfillment payload', 'throw in finally overrides with rejection', 'reject never reaches fulfillment handler in this run', 'reject reason retains identity'], {
  events, samePromise: finalizedPromise === originalPromise, finallySamePayload: true,
  thenSameOther: mapped === other, thrownReasonSameOther: thrownReason === other,
  fulfillmentCallsAfterReject: rejectFulfilled, rejectReasonSameOther: rejectReason === other,
});

// N05: a shared member declaration does not imply shared object state.
class Cell {
  value = null;
  set(value) { this.value = value; }
  get() { return this.value; }
}
const left = new Cell();
const right = new Cell();
left.set(token);
assert.equal(left.get(), token);
assert.equal(right.get(), null);
record('N05', ['left instance contains token', 'right instance remains null'], {
  sameLeftValue: left.get() === token, rightValue: right.get(), sameInstance: left === right,
});

// N06: callback registration alone does not establish execution.
let calls = 0;
const callback = () => { calls++; return token; };
const neverFired = new EventTarget();
neverFired.addEventListener('sample', callback);
assert.equal(calls, 0);
neverFired.removeEventListener('sample', callback);
neverFired.dispatchEvent(new Event('sample'));
assert.equal(calls, 0);
const positive = new EventTarget();
positive.addEventListener('sample', callback);
positive.dispatchEvent(new Event('sample'));
assert.equal(calls, 1);
record('N06', ['registration window contains zero calls', 'removal before dispatch yields zero calls', 'positive dispatch invokes callback once'], {
  registrationWindowCalls: 0, removedWindowCalls: 0, positiveWindowCalls: calls,
  runtime: 'Node EventTarget; this is not a browser DOM test',
});

process.stdout.write(JSON.stringify({
  mission: 'srcly-js-react-solid-gap-research',
  baseline: 'e07cc510087b5c028273cad785b97ee36c6c3b35',
  executedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  scope: 'Original isolated ECMAScript/Node controls only; no Srcly, React, Solid, browser, instrumented packet, or repository survey execution.',
  cases: records,
  caseCount: records.length,
  assertionCount: records.reduce((n, r) => n + r.assertions.length, 0),
}, null, 2) + '\n');
