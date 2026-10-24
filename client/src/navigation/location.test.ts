import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  baseName,
  atFromTreePath,
  crumbsFor,
  graphIdFor,
  normalizeScopeName,
  parentAt,
  parseLocation,
  toSearch,
  treePathFromAt,
} from "./location";
import { resolveTreeAt } from "./resolveTree";

describe("parseLocation / toSearch", () => {
  it("round-trips folders, files and symbols", () => {
    for (const loc of [
      { repo: "", at: "client/src", view: "treemap" as const },
      { repo: "/home/me/my repo", at: "client/src/App.tsx", view: "graph" as const },
      { repo: "/r", at: "server/app/run.py#main", view: "graph" as const },
      { repo: "", at: "a.ts#Foo (class)::#secret", view: "treemap" as const },
      { repo: "C:\\code\\x", at: "ext:react", view: "graph" as const },
    ]) {
      expect(parseLocation(toSearch(loc))).toEqual(loc);
    }
  });

  it("round-trips folders opened in place", () => {
    const loc = { repo: "/r", at: "client/src", view: "graph" as const, open: ["client/src/viz", "client/src/viz/deps"] };
    expect(parseLocation(toSearch(loc))).toEqual(loc);
    expect(toSearch({ ...loc, open: [] })).not.toContain("open=");
  });

  it("round-trips Data flow mode, with and without a route", () => {
    const loc = { repo: "/r", at: "", view: "graph" as const, flow: "route:abc" };
    expect(parseLocation(toSearch(loc))).toEqual(loc);
    const picking = { ...loc, flow: "" };
    expect(parseLocation(toSearch(picking))).toEqual(picking);
    // Imports mode has no flow param, and the treemap ignores one.
    expect(parseLocation(toSearch({ ...loc, flow: undefined }))).toEqual({ repo: "/r", at: "", view: "graph" });
    expect(parseLocation("?view=treemap&flow=route:abc")).toEqual({ repo: "", at: "", view: "treemap" });
  });

  it("treats the empty root treemap as a bare URL", () => {
    expect(toSearch({ repo: "", at: "", view: "treemap" })).toBe("");
    expect(parseLocation("")).toEqual({ repo: "", at: "", view: "treemap" });
    expect(parseLocation("?view=graph")).toEqual({ repo: "", at: "", view: "graph" });
  });

  it("encodes the symbol fragment so it survives the URL", () => {
    const search = toSearch({ repo: "", at: "a.py#run", view: "graph" });
    expect(search).toContain("a.py%23run");
    expect(new URL(`http://x/${search}`).hash).toBe("");
  });

  it("reads the legacy depFocus alias as the graph view", () => {
    expect(parseLocation("?depFocus=server%2Fapp")).toEqual({ repo: "", at: "server/app", view: "graph" });
    expect(parseLocation("?depFocus=%2F")).toEqual({ repo: "", at: "", view: "graph" });
    expect(parseLocation("?depFocus=a&at=b&view=treemap")).toEqual({ repo: "", at: "b", view: "treemap" });
  });

  it("keeps foreign params and drops the legacy one", () => {
    const s = toSearch({ repo: "/r", at: "x", view: "graph" }, "?compare=main..HEAD&depFocus=old");
    const params = new URLSearchParams(s);
    expect(params.get("compare")).toBe("main..HEAD");
    expect(params.get("depFocus")).toBeNull();
    expect(params.get("at")).toBe("x");
    expect(params.get("repo")).toBe("/r");
  });

  it("ignores an unknown view", () => {
    expect(parseLocation("?view=bogus&at=a").view).toBe("treemap");
  });
});

describe("repo", () => {
  it("puts the repo first and keeps it out when empty", () => {
    expect(toSearch({ repo: "/r", at: "a", view: "graph" })).toBe("?repo=%2Fr&at=a&view=graph");
    expect(parseLocation("?at=a").repo).toBe("");
  });
  it("names the repo by its folder", () => {
    expect(baseName("/home/me/srcly")).toBe("srcly");
    expect(baseName("/home/me/srcly/")).toBe("srcly");
    expect(baseName("C:\\code\\x")).toBe("x");
  });
});

describe("hierarchy helpers", () => {
  it("walks up scope → file → folder → root", () => {
    expect(ancestorsOf("a/b.py#C::d")).toEqual(["a/b.py#C::d", "a/b.py#C", "a/b.py", "a", ""]);
    expect(parentAt("")).toBeNull();
    expect(parentAt("ext:react")).toBe("");
  });

  it("builds one breadcrumb trail for both views", () => {
    expect(crumbsFor("a/b.py#C::d", "repo")).toEqual([
      { label: "repo", at: "" },
      { label: "a", at: "a" },
      { label: "b.py", at: "a/b.py" },
      { label: "C", at: "a/b.py#C" },
      { label: "d", at: "a/b.py#C::d" },
    ]);
    expect(crumbsFor("", "")).toEqual([{ label: "root", at: "" }]);
    expect(crumbsFor("ext:react", "repo").map((c) => c.label)).toEqual(["repo", "react"]);
  });
});

describe("tree paths", () => {
  const root = "/home/me/repo";
  it("converts scan-tree paths to locations and back", () => {
    expect(atFromTreePath(root, root)).toBe("");
    expect(atFromTreePath(`${root}/a/b.ts`, root)).toBe("a/b.ts");
    expect(atFromTreePath(`${root}/a/b.ts::Foo (class)::run`, root)).toBe("a/b.ts#Foo (class)::run");
    expect(atFromTreePath("/elsewhere/x", root)).toBeNull();
    expect(atFromTreePath(`${root}x/y`, root)).toBeNull();
    expect(treePathFromAt("a/b.ts#Foo (class)::run", root)).toBe(`${root}/a/b.ts::Foo (class)::run`);
    expect(treePathFromAt("", root)).toBe(root);
    expect(treePathFromAt("a", "/")).toBe("/a");
  });

  it("strips scope decorations", () => {
    expect(normalizeScopeName("Foo (class)")).toBe("Foo");
    expect(normalizeScopeName("(class) Foo")).toBe("Foo");
    expect(normalizeScopeName("run (async)")).toBe("run");
  });
});

describe("graphIdFor", () => {
  const ids = new Set(["", "a", "a/b.py", "a/b.py#Foo"]);
  const has = (id: string) => ids.has(id);
  it("maps exact, decorated scopes, and missing files to the nearest node", () => {
    expect(graphIdFor("a/b.py#Foo", has)).toBe("a/b.py#Foo");
    expect(graphIdFor("a/b.py#Foo (class)::run", has)).toBe("a/b.py#Foo");
    expect(graphIdFor("a/b.py#nope", has)).toBe("a/b.py");
    expect(graphIdFor("a/README.md", has)).toBe("a");
    expect(graphIdFor("gone/x.ts", has)).toBe("");
  });
});

describe("resolveTreeAt", () => {
  const root = "/r";
  const tree = {
    path: "/r",
    name: "root",
    children: [
      {
        path: "/r/a",
        name: "a",
        children: [
          {
            path: "/r/a/b.py",
            name: "b.py",
            children: [
              { path: "/r/a/b.py::Foo (class)", name: "Foo (class)", children: [] },
              { path: "/r/a/b.py::helper", name: "helper", children: [] },
            ],
          },
        ],
      },
      { path: "/r/ab", name: "ab", children: [] },
    ],
  };

  it("finds exact nodes without confusing prefix siblings", () => {
    expect(resolveTreeAt(tree, root, "ab").node.name).toBe("ab");
    expect(resolveTreeAt(tree, root, "a/b.py#helper")).toMatchObject({ match: "exact", at: "a/b.py#helper" });
    expect(resolveTreeAt(tree, root, "").node).toBe(tree);
  });

  it("matches a bare graph symbol to a decorated scope", () => {
    const r = resolveTreeAt(tree, root, "a/b.py#Foo");
    expect(r).toMatchObject({ match: "scope", at: "a/b.py#Foo (class)" });
  });

  it("falls back to the file for an unknown symbol", () => {
    expect(resolveTreeAt(tree, root, "a/b.py#nope")).toMatchObject({ match: "scope", at: "a/b.py" });
  });

  it("falls back to the nearest ancestor for a deleted path", () => {
    expect(resolveTreeAt(tree, root, "a/gone/x.ts")).toMatchObject({ match: "missing", at: "a" });
    expect(resolveTreeAt(tree, root, "ext:react")).toMatchObject({ match: "external", at: "" });
  });
});
