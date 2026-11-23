// Designed, not executed. Run only after the Solid 1.9.17 package/entry preflight.
// Browser import map resolves both bare names to integrity-checked client entries.
import {
  createComponent, createRenderEffect, createResource, createRoot,
  createSignal, mergeProps, splitProps,
} from 'solid-js';
import { createStore } from 'solid-js/store';

function checks() {
  let count = 0;
  return {
    equal(actual, expected, label) {
      count += 1;
      if (!Object.is(actual, expected)) throw new Error(label);
    },
    throwsSame(run, expected, label) {
      count += 1;
      try { run(); } catch (error) {
        if (Object.is(error, expected)) return;
        throw new Error(`${label}: wrong error identity`);
      }
      throw new Error(`${label}: did not throw`);
    },
    count() { return count; },
  };
}

// Deliberately renders only explicitly selected scalar values. Never enumerates
// a props object or store proxy, invokes unknown getters, or serializes a proxy.
function outputFor(container, read) {
  const output = document.createElement('output');
  container.append(output);
  createRenderEffect(() => { output.textContent = String(read() ?? ''); });
  return output;
}

async function withinTenMicrotasks(predicate, label) {
  for (let n = 0; n <= 10; n += 1) {
    if (predicate()) return n;
    if (n === 10) throw new Error(`${label}: exceeded ten microtask checkpoints`);
    await Promise.resolve();
  }
  throw new Error('unreachable');
}

export function runS4(container) {
  const assert = checks();
  let stop;
  let getterReads = 0;
  let reactiveFixture;
  try {
    createRoot(dispose => {
      stop = dispose;
      const [label, setLabel] = createSignal('alpha');
      const props = {
        get label() { getterReads += 1; return label(); },
        kind: 'primary',
      };
      let views;
      function PropsFixture(received) {
        const [local, rest] = splitProps(received, ['label']);
        const merged = mergeProps(received, { label: 'fixed' });
        const fallback = mergeProps(received, { label: undefined });
        views = { local, rest, merged, fallback };
        return null;
      }
      createComponent(PropsFixture, props);
      assert.equal(getterReads, 0, 'creating views must not evaluate this label getter');
      const snapshot = props.label;
      assert.equal(snapshot, 'alpha', 'snapshot initial value');
      assert.equal(views.local.label, 'alpha', 'included split key');
      assert.equal(views.rest.kind, 'primary', 'remainder key');
      assert.equal(Reflect.get(views.rest, 'label'), undefined, 'excluded label');
      assert.equal(Reflect.get(views.local, 'kind'), undefined, 'excluded kind');
      const beforeOverrideRead = getterReads;
      assert.equal(views.merged.label, 'fixed', 'later defined source wins');
      assert.equal(getterReads, beforeOverrideRead, 'overridden getter not evaluated');
      const beforeFallbackRead = getterReads;
      assert.equal(views.fallback.label, 'alpha', 'undefined falls back');
      assert.equal(getterReads, beforeFallbackRead + 1, 'winning getter read exactly once');

      const liveOutput = outputFor(container, () => views.local.label);
      const fixedOutput = outputFor(container, () => views.merged.label);
      const excludedOutput = outputFor(container, () => Reflect.get(views.rest, 'label'));
      assert.equal(liveOutput.textContent, 'alpha', 'initial live DOM value');
      reactiveFixture = { setLabel, snapshot, views, liveOutput, fixedOutput, excludedOutput };

      const [state, setState] = createStore({
        left: { title: 'L' }, right: { title: 'R' },
        items: [{ id: 1, label: 'a' }, { id: 2, label: 'b' }],
      });
      let previousTitle;
      setState('left', 'title', previous => { previousTitle = previous; return 'N'; });
      assert.equal(previousTitle, 'L', 'updater receives selected field, not whole state');
      assert.equal(state.left.title, 'N', 'selected title changed');
      assert.equal(state.right.title, 'R', 'sibling title excluded');
      assert.equal(state.items[0].label, 'a', 'first item untouched by title update');
      assert.equal(state.items[1].label, 'b', 'second item untouched by title update');
      let previousLabel;
      setState('items', item => item.id === 2, 'label', previous => {
        previousLabel = previous;
        return 'z';
      });
      assert.equal(previousLabel, 'b', 'path updater receives selected item field');
      assert.equal(state.items[0].label, 'a', 'predicate excludes first item');
      assert.equal(state.items[1].label, 'z', 'predicate boolean is not stored');
      assert.equal(state.left.title, 'N', 'item update excludes left title');
      assert.equal(state.right.title, 'R', 'item update excludes right title');

      const [namedState, setNamed] = createStore({ left: { title: 'L' } });
      const updater = previous => {
        assert.equal(previous, 'L', 'named updater receives same selected value');
        return 'N';
      };
      setNamed('left', 'title', updater);
      assert.equal(namedState.left.title, state.left.title, 'named/inline updater parity');
    });
    // Update after createRoot has completed, outside its initial effect queue.
    reactiveFixture.setLabel('beta');
    assert.equal(reactiveFixture.snapshot, 'alpha', 'destructured scalar stays snapshot');
    assert.equal(reactiveFixture.views.local.label, 'beta', 'split getter stays live');
    assert.equal(reactiveFixture.views.fallback.label, 'beta', 'fallback getter stays live');
    assert.equal(reactiveFixture.liveOutput.textContent, 'beta', 'live selected DOM field updates');
    assert.equal(reactiveFixture.fixedOutput.textContent, 'fixed', 'overridden DOM field remains fixed');
    assert.equal(reactiveFixture.excludedOutput.textContent, '', 'excluded key contributes no DOM text');
    return { caseId: 'E-S4', assertions: assert.count(), getterReads };
  } finally {
    if (stop) stop();
    container.replaceChildren();
  }
}

export async function runS5(container) {
  const assert = checks();
  const token = Object.freeze({ id: 'payload' });
  const replacement = Object.freeze({ id: 'replacement' });
  const parsed = Object.freeze({ secret: 'observed' });
  const fixed = Object.freeze({ title: 'fixed' });
  const failure = new Error('expected resource failure');
  const noSourceCalls = [];
  const sourceCalls = [];
  const consumed = [];
  let stop;
  let fixture;
  try {
    // All owners/computations are constructed synchronously inside this root.
    // No createResource/createRenderEffect is called after an await.
    createRoot(dispose => {
      stop = dispose;
      const [noSource] = createResource(async (source, info) => {
        noSourceCalls.push({ source, refetching: info.refetching, value: info.value });
        return token;
      });
      const [key, setKey] = createSignal(false);
      async function namedFetcher(source, info) {
        sourceCalls.push({ source, refetching: info.refetching, value: info.value });
        return token;
      }
      const [data, controls] = createResource(key, namedFetcher);
      const response = { async json() { return parsed; } };
      const [negative] = createResource(() => 'negative', async () => {
        const ignoredPayload = await response.json();
        consumed.push(ignoredPayload);
        return fixed;
      });
      const [positive] = createResource(() => 'positive', async () => {
        return await response.json();
      });
      const [rejected] = createResource(async () => { throw failure; });
      const negativeOutput = outputFor(container, () => negative()?.title);
      const positiveOutput = outputFor(container, () => positive()?.secret);
      fixture = { noSource, data, controls, setKey, negative, positive, rejected,
        negativeOutput, positiveOutput };
    });

    assert.equal(noSourceCalls.length, 1, 'no-source fetcher entered once');
    assert.equal(noSourceCalls[0].source, true, 'no-source input is true');
    assert.equal(noSourceCalls[0].refetching, false, 'initial fetch is not refetch');
    assert.equal(noSourceCalls[0].value, undefined, 'no prior value initially');
    assert.equal(sourceCalls.length, 0, 'false source: no callback in W0');
    assert.equal(fixture.data(), undefined, 'disabled resource has no payload');
    assert.equal(fixture.data.state, 'unresolved', 'disabled resource unresolved');
    // W0 is now closed. Its zero executions are observations, not no-flow proof.
    await withinTenMicrotasks(() =>
      fixture.noSource.state === 'ready' && fixture.negative.state === 'ready' &&
      fixture.positive.state === 'ready' && fixture.rejected.state === 'errored',
    'initial resource settlements');
    assert.equal(fixture.noSource(), token, 'no-source payload identity');
    assert.equal(fixture.noSource.loading, false, 'ready payload not loading');
    assert.equal(fixture.noSource.error, undefined, 'ready payload has no error');
    assert.equal(fixture.negative(), fixed, 'discarded JSON not returned payload');
    assert.equal(Reflect.get(fixture.negative(), 'secret'), undefined, 'discarded field absent');
    assert.equal(consumed[0], parsed, 'JSON still reaches its explicit consumer');
    assert.equal(fixture.positive(), parsed, 'returned JSON payload identity');
    assert.equal(fixture.negativeOutput.textContent, 'fixed', 'negative DOM payload');
    assert.equal(fixture.positiveOutput.textContent, 'observed', 'positive DOM payload');
    assert.equal(fixture.rejected.error, failure, 'resource error channel identity');
    assert.throwsSame(() => fixture.rejected(), failure, 'errored accessor throws');
    assert.equal(sourceCalls.length, 0, 'disabled source remains never invoked after checkpoints');

    fixture.setKey('k');
    await withinTenMicrotasks(() => fixture.data.state === 'ready', 'enabled resource');
    assert.equal(sourceCalls.length, 1, 'enabling source fetches once');
    assert.equal(sourceCalls[0].source, 'k', 'named fetcher source value');
    assert.equal(fixture.data(), token, 'enabled data payload');
    const mutateResult = fixture.controls.mutate(replacement);
    assert.equal(mutateResult, replacement, 'Solid resource mutate returns replacement');
    assert.equal(fixture.data(), replacement, 'mutate updates data without fetch');
    assert.equal(sourceCalls.length, 1, 'mutate does not call fetcher');
    await Promise.resolve(); // leave any library same-tick refetch coalescing window
    const refetchResult = fixture.controls.refetch('manual');
    await withinTenMicrotasks(() => fixture.data.state === 'ready', 'manual refetch');
    assert.equal(await refetchResult, token, 'this async refetch returns its settled payload');
    assert.equal(sourceCalls.length, 2, 'manual refetch invokes fetcher once');
    assert.equal(sourceCalls[1].source, 'k', 'refetch keeps current source');
    assert.equal(sourceCalls[1].refetching, 'manual', 'refetch metadata distinct from payload');
    assert.equal(sourceCalls[1].value, replacement, 'refetch receives previous current value');
    assert.equal(fixture.data(), token, 'refetch completion payload');
    return { caseId: 'E-S5', assertions: assert.count(), sourceCalls: sourceCalls.length,
      window0CallbackCount: 0 };
  } finally {
    if (stop) stop();
    container.replaceChildren();
  }
}
