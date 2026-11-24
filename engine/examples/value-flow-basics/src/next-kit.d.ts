// Next's app router, as its declarations give it: the router object `useRouter` hands back is an interface package `next` declares.
declare module "next" {
  export interface AppRouterInstance {
    push(href: string): void;
    replace(href: string): void;
    back(): void;
  }
}
declare module "next/navigation" {
  import type { AppRouterInstance } from "next";
  export function useRouter(): AppRouterInstance;
}
