import * as fs from "node:fs";
import { readFileSync as read } from "node:fs";

// A library export is known by its module and its own name, however the
// import names it: `fs.readFileSync` through a namespace and `read` renamed
// are both file reads. A method library code declares (`xs.filter`) is known
// by its own name; a method of the program's own with the same name is not,
// and neither is an object of the program's own with a `readFileSync`.
export function Loaded(props: { path: string; other: string }) {
  const viaNamespace = fs.readFileSync(props.path, "utf8"); // @reaches ns-read file-input
  const viaRename = read(props.other, "utf8"); // @reaches renamed-read file-input
  return <p>{viaNamespace}{viaRename}</p>; // @trace ns-read backward viaNamespace @trace renamed-read backward viaRename
}

const own = { filter: (items: string[]) => items.join(",") };

export function Listed(props: { items: string[]; more: string[] }) {
  const upper = props.items.filter(Boolean); // @trace lib-filter forward props.items @outcome lib-filter ok
  const joined = own.filter(props.more); // @trace own-filter forward props.more @outcome own-filter ok
  return <p>{upper}{joined}</p>; // @reaches lib-filter,own-filter render-terminal
}

const disk = { readFileSync: (path: string) => path.trim() };

export function NotLoaded(props: { path: string }) { // @stop own-read untraced parameter
  const local = disk.readFileSync(props.path); // @never-reaches own-read file-input
  return <p>{local}</p>; // @trace own-read backward local
}
