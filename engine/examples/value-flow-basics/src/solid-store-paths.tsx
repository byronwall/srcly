import { createStore } from "solid-js/store";

// Store paths: `setStore("left", "title", value)` writes `left.title` alone.
// What one path writes reaches only the reads of that path, never a sibling
// field: `props.title` reaches `store.left.title`, never `store.right.title`.
// An updater's parameter is the field it replaces, not the whole store, so
// `prev` comes from the `right` seed alone (and from its own earlier
// returns, a loop the walk leaves at `prev`). A predicate in the path picks
// items; what it returns is a test for Solid, never stored. A named updater is called
// like an inline one: what it returns is stored, not the function.
export function StorePaths(props: { title: string; other: string; seedLeft: string; seedRight: string; id: number; label: string }) { // @stop sp-prev untraced parameter
  const [store, setStore] = createStore({ left: { title: props.seedLeft }, right: { title: props.seedRight }, items: [{ id: 1, label: "a" }] }); // @trace sp-seed-left forward props.seedLeft @visits sp-prev * "seedRight" @never-reaches sp-prev * "seedLeft"
  setStore("left", "title", props.title); // @trace sp-title forward props.title
  setStore("right", "title", (prev) => prev + props.other); // @trace sp-other forward props.other @trace sp-prev backward prev @stop sp-prev untraced value
  setStore("items", (item) => item.id === props.id, "label", props.label); // @trace sp-id forward props.id @trace sp-label forward props.label @reaches sp-id return
  // @outcome sp-title,sp-other,sp-label ok
  return (
    <p>
      {/* @reaches sp-title,sp-seed-left render-terminal @never-reaches sp-other,sp-label,sp-id render-terminal */}
      <b>{store.left.title}</b>
      {/* @reaches sp-other render-terminal @never-reaches sp-title,sp-seed-left,sp-label,sp-id render-terminal */}
      <i>{store.right.title}</i>
      {/* @reaches sp-label render-terminal @never-reaches sp-title,sp-other,sp-id render-terminal */}
      <em>{store.items[0].label}</em>
    </p>
  );
}

// A named updater: its return is the field's new value, and two stores never mix.
export function NamedUpdater(props: { named: string; elsewhere: string }) {
  const [doc, setDoc] = createStore({ head: { title: "" } });
  const [other, setOther] = createStore({ head: { title: "" } });
  const rename = () => props.named; // @trace sp-named forward props.named @outcome sp-named ok
  setDoc("head", "title", rename);
  setOther("head", "title", props.elsewhere); // @trace sp-elsewhere forward props.elsewhere
  return (
    <p>
      {/* @reaches sp-named render-terminal @never-reaches sp-elsewhere render-terminal */}
      <b>{doc.head.title}</b>
      {/* @reaches sp-elsewhere render-terminal @never-reaches sp-named render-terminal */}
      <i>{other.head.title}</i>
    </p>
  );
}
