// Values handed to calls with no source in the program. `names.push(...)`
// throws its value away, so its argument can only stay in `names`: it
// reaches the binding, as an assumption (partial). `kept.concat(...)` keeps
// its value, so its argument goes to `more`, never into `kept`. The
// collection method `find` names its result apart from the call; that
// result is the call's own value, so it reaches `first`.
export function Roster(props: { tags: string[] }) {
  const names: string[] = [];
  names.push(props.tags[0]);
  const kept: string[] = [];
  const more = kept.concat(props.tags);
  const first = props.tags.find((tag) => tag.length > 1);
  return (
    <p title={first}>
      {names} {kept} {more}
    </p>
  );
}

// `log` is module state this function does not own: the pushed value stops
// at the library call instead of reaching every reader of `log`.
const log: string[] = [];
export function record(entry: string) {
  log.push(entry);
}
