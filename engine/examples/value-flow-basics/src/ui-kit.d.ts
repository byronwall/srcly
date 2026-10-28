// A component library with no source in the program: its factory's body is outside it.
declare module "ui-kit" {
  export function styled<P>(base: (props: P) => unknown, name: string): (props: P) => unknown;
}

// A third-party library with no source to read: what it does is assumed.
declare module "slug-kit" {
  export function slugify(text: string): string;
}
