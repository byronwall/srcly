// A component library with no source in the program: it calls its `fallback` with an error a child threw.
declare module "boundary-kit" {
  export function Boundary(props: { fallback: (err: Error, reset: () => void) => unknown; children?: unknown }): unknown;
}
