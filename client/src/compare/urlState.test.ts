// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { compareHref, FILTER_PARAM, navigateCompare, navigateStep, readFilterParam } from "./api";

// The Compare path filter lives in the URL, scoped to one repo and ref pair.
describe("the compare path filter in the URL", () => {
  beforeEach(() => window.history.replaceState(null, "", "/?repo=%2Frepo%2Fa&compare=f2544ff%5E..f2544ff&cfile=a.ts"));

  it("round-trips through the URL, including characters that need escaping", () => {
    for (const value of ["models/", "src/a b&c=d.ts", "#x?y"]) {
      const url = new URL(window.location.href);
      url.searchParams.set(FILTER_PARAM, value);
      window.history.replaceState(null, "", url.pathname + url.search);
      expect(readFilterParam()).toBe(value);
    }
    expect(readFilterParam("?compare=a..b")).toBe("");
  });

  it("is dropped when the ref pair changes, and the repo is kept", () => {
    window.history.replaceState(null, "", window.location.search + "&cq=models%2F");
    const next = new URL(compareHref("main", "f2544ff"), window.location.origin);
    expect(next.searchParams.get(FILTER_PARAM)).toBeNull();
    expect(next.searchParams.get("repo")).toBe("/repo/a");

    navigateStep("a", "b", { base: "a", head: "c" });
    expect(readFilterParam()).toBe("");
  });

  it("is dropped when leaving compare", () => {
    window.history.replaceState(null, "", window.location.search + "&cq=models%2F");
    navigateCompare(null);
    expect(new URLSearchParams(window.location.search).has("compare")).toBe(false);
    expect(readFilterParam()).toBe("");
  });
});
