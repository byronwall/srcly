// A call into the page that the code makes for its effect hands its
// arguments to the page: TypeScript's DOM lib declares the member, and the
// code drops what it returns. A DOM call whose value the code uses is a read
// that carries on, not where the value ends.
export function markTab(root: HTMLElement, tab: string) { // @trace mark-tab forward symbol tab @outcome mark-tab ok
  root.classList.toggle(`tab-${tab}`, true); // @reaches mark-tab external-effect
}

export function announce(target: EventTarget, message: string) { // @trace announce forward symbol message @outcome announce ok
  target.dispatchEvent(new CustomEvent("announce", { detail: message })); // @reaches announce external-effect
}

export function focusAll(fields: HTMLInputElement[]) { // @trace focus-all forward symbol fields @outcome focus-all ok
  fields.forEach((field) => field.focus()); // @reaches focus-all external-effect @reaches focus-all call
}

// A query is a read with its value kept or dropped: only what the code does
// with the node can change the page. A host of the project's own with the same
// method name is not the page at all.
export function probe(root: HTMLElement, selector: string) {
  root.querySelector(selector); // @trace dropped-query forward selector @never-reaches dropped-query external-effect @reaches dropped-query call
}

export function write(root: HTMLElement, label: string) {
  root.setAttribute("title", label); // @trace page-write forward label @reaches page-write external-effect
}

class FakeHost {
  querySelector(selector: string) {
    return selector;
  }
}

export function fakeHost(selector: string) {
  const host = new FakeHost();
  const found = host.querySelector(selector); // @trace fake-query forward selector @never-reaches fake-query external-effect
  return found; // @reaches fake-query return
}

export function findRow(root: HTMLElement, selector: string) { // @trace find-row forward symbol selector @outcome find-row ok
  const row = root.querySelector(selector); // @never-reaches find-row external-effect
  return row; // @reaches find-row return
}
