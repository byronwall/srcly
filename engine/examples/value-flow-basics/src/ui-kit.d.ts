// A component library with no source in the program: its factory's body is outside it.
declare module "ui-kit" {
  export function styled<P>(base: (props: P) => unknown, name: string): (props: P) => unknown;
}
