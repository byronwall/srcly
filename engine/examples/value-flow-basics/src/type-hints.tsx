import "./type-kit";
import { keepFn, makeSlot, memoize, readSlot } from "type-kit";

// A package call with no row. `memoize<T>(compute: () => T, deps): T` ties
// the callback's return to the call's value, so that path is drawn, assumed:
// the same type, not a proven value. It replaces the opaque edges, so the
// dependency list is not in the value and the call is no assumed effect.
export function Memo(props: { n: number; key: string }) {
  const doubled = memoize(() => props.n * 2, [props.key]); // @trace typed-memo forward props.n @outcome typed-memo assumed @edge typed-memo return-value partial type-signature @no-edge typed-memo * * external-call @trace typed-deps forward props.key @outcome typed-deps partial @stop typed-deps disconnected object-pack @no-edge typed-deps * * type-signature
  return <p>{doubled}</p>; // @reaches typed-memo render-terminal @path typed-memo "props.n * 2" "doubled"
}

// `readSlot<T>(slot: Slot<T>): T` only says the result has the slot's type.
// Who filled the slot (a provider, a later write) is not in the signature, so
// the read gets no proposal: the fallback reaches it only through the opaque
// assumption, as before. `makeSlot<T>(fallback: T): Slot<T>` does propose.
const Theme = makeSlot("light"); // @visits typed-slot
export function Badge() {
  const theme = readSlot(Theme); // @trace typed-slot backward symbol theme @outcome typed-slot assumed @edge typed-slot argument partial external-call @edge typed-slot framework-flow partial type-signature
  return <b>{theme}</b>;
}

// `keepFn(fn: () => string): () => string` has no type parameter: no proposal.
export function Kept(props: { label: string }) {
  const read = keepFn(() => props.label); // @trace typed-kept forward props.label @outcome typed-kept partial @no-edge typed-kept * * type-signature @reaches typed-kept external-effect @stop typed-kept disconnected alias
  return <i>{read()}</i>; // @reaches typed-kept render-terminal
}
