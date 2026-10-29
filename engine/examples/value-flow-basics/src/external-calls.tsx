import { slugify } from "slug-kit";

// Values handed to calls with no source in the program. `names.push(...)`
// throws its value away, so its argument can only stay in `names`: it
// reaches the binding, modelled as the standard library. `kept.concat(...)` keeps
// its value, so its argument goes to `more`, never into `kept`. The
// collection method `find` names its result apart from the call; that
// result is the call's own value, so it reaches `first`.
export function Roster(props: { tags: string[] }) {
  const names: string[] = []; // @edge pushed references proven standard-library
  names.push(props.tags[0]); // @trace pushed forward props.tags[0] @outcome pushed ok
  const kept: string[] = []; // @never-reaches concat * "kept"
  const more = kept.concat(props.tags); // @trace concat forward props.tags @edge concat argument proven standard-library @no-edge concat * partial
  const first = props.tags.find((tag) => tag.length > 1); // @trace found forward props.tags.find((tag) => tag.length > 1) @outcome found ok @visits found call-result
  return (
    <p title={first}> {/* @reaches found dom-terminal "first" */}
      {/* @reaches pushed * "names" @reaches concat * "more" @never-reaches concat * "kept" */}
      {names} {kept} {more}
    </p>
  );
}

// `log` is module state this function does not own: the pushed value stops
// at the library call instead of reaching every reader of `log`.
const log: string[] = []; // @never-reaches logged * "log"
export function record(entry: string) {
  log.push(entry); // @trace logged forward entry @stop logged external-code * "log.push" @never-reaches logged * "log"
}

// Library code that is not the standard library has no source to read and no
// model: its value is assumed to derive from its argument. The trace lands
// with no stop, but only through that assumption, so it is `assumed` and its
// assumed edge is the explanation.
export function Slug(props: { title: string }) {
  const slug = slugify(props.title); // @trace slug forward props.title @outcome slug assumed @edge slug argument partial external-call @reaches slug external-effect
  return <a href={slug}>{props.title}</a>; // @reaches slug dom-terminal
}

// Assuming one step does not make up for a stop: the value goes through a
// library call (`slugify`) and then stops at `log.push`, so the trace stays
// partial, not assumed.
export function recordShout(entry: string) {
  log.push(slugify(entry)); // @trace shouted forward entry @outcome shouted partial @stop shouted external-code * "log.push" @edge shouted argument partial external-call @reaches shouted external-effect
}
