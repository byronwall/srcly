import { describe, expect, it } from "vitest";
import {
  encodeAnchors,
  MAX_ANCHORS,
  parseAnchors,
  ancestorsOf,
  baseName,
  atFromTreePath,
  crumbsFor,
  encodeAnchor,
  isDataFlow,
  parseAnchor,
  graphIdFor,
  normalizeScopeName,
  parentAt,
  parseLocation,
  sameLocation,
  samePlace,
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

  it("round-trips a selected origin and destination, which never make a new place", () => {
    const loc = { repo: "/r", at: "", view: "graph" as const, flow: "route:abc", field: "program-element:1", dest: "route-terminal:2" };
    expect(parseLocation(toSearch(loc))).toEqual(loc);
    // A destination needs an origin, and both need Data flow mode.
    expect(parseLocation("?view=graph&flow=r&dest=d")).toEqual({ repo: "", at: "", view: "graph", flow: "r" });
    expect(parseLocation("?view=graph&field=f")).toEqual({ repo: "", at: "", view: "graph" });
    expect(samePlace(loc, { ...loc, field: undefined, dest: undefined })).toBe(true);
    expect(sameLocation(loc, { ...loc, dest: undefined })).toBe(false);
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

describe("anchor mode", () => {
  it("round-trips an anchor by span and by name, with the direction only when it is not both", () => {
    const span = encodeAnchor({ file: "src/a.tsx", span: { startLine: 6, startColumn: 21, endLine: 6, endColumn: 39 } });
    expect(span).toBe("src/a.tsx:6:21-6:39");
    const loc = { repo: "/r", at: "", view: "graph" as const, anchor: span, dir: "backward" as const };
    expect(parseLocation(toSearch(loc))).toEqual(loc);
    expect(toSearch({ ...loc, dir: "both" })).not.toContain("dir=");
    expect(parseLocation(toSearch({ ...loc, dir: "both" }))).toEqual({ repo: "/r", at: "", view: "graph", anchor: span });
    const named = encodeAnchor({ file: "src/a.tsx", name: "props", line: 3 });
    expect(named).toBe("src/a.tsx@props:3");
    expect(parseAnchor(named)).toEqual({ file: "src/a.tsx", name: "props", line: 3 });
    expect(parseAnchor(span)).toEqual({ file: "src/a.tsx", span: { startLine: 6, startColumn: 21, endLine: 6, endColumn: 39 } });
    expect(parseAnchor("nonsense")).toBeNull();
  });

  it("is Data flow mode without a route, and never both at once", () => {
    const anchor = "src/a.tsx:6:21-6:39";
    expect(isDataFlow({ anchor })).toBe(true);
    expect(isDataFlow({ flow: "" })).toBe(true);
    expect(isDataFlow({})).toBe(false);
    // An anchor wins over a route in the URL, and leaves the graph on the anchor.
    expect(parseLocation(`?view=graph&flow=route:abc&anchor=${anchor}`)).toEqual({ repo: "", at: "", view: "graph", anchor });
    const search = toSearch({ repo: "", at: "", view: "graph", flow: "route:abc", anchor });
    expect(search).toContain("anchor=");
    expect(search).not.toContain("flow=");
    // A broken anchor is ignored; the treemap ignores both.
    expect(parseLocation("?view=graph&anchor=nonsense")).toEqual({ repo: "", at: "", view: "graph" });
    expect(parseLocation(`?view=treemap&anchor=${anchor}&dir=forward`)).toEqual({ repo: "", at: "", view: "treemap" });
    // The direction and the anchor are part of the place: a new anchor is a new history entry, a new direction is not.
    const a = { repo: "", at: "", view: "graph" as const, anchor };
    expect(samePlace(a, { ...a, anchor: "src/b.tsx:1:1-1:2" })).toBe(false);
    expect(samePlace(a, { ...a, dir: "forward" })).toBe(true);
    expect(sameLocation(a, { ...a, dir: "forward" })).toBe(false);
  });
});

describe("several anchors in one value (T20)", () => {
  it("round-trips up to three anchors and refuses more, a bad part, or a file anchor among others", () => {
    const a = { file: "src/a.tsx", name: "A", line: 3 };
    const b = { file: "src/b.tsx", span: { startLine: 1, startColumn: 2, endLine: 1, endColumn: 9 } };
    const c = { file: "src/c.ts", name: "c", line: 10 };
    expect(parseAnchors(encodeAnchors([a, b, c]))).toEqual([a, b, c]);
    expect(parseAnchors(encodeAnchors([a]))).toEqual([a]);
    expect(MAX_ANCHORS).toBe(3);
    expect(parseAnchors(encodeAnchors([a, b, c, a]))).toEqual([]);
    expect(parseAnchors("src/a.tsx@A:3|nonsense")).toEqual([]);
    expect(parseAnchors("src/a.tsx@A:3|src/utils@*")).toEqual([]);
    expect(parseAnchors("src/utils@*")).toEqual([{ file: "src/utils", exports: true }]);
    // A drawn box by element id (T20) joins a name anchor; the id may hold colons.
    expect(parseAnchors("src/a.tsx@A:3|src/r.tsx@el:program-element:7n4kxc")).toEqual([a, { file: "src/r.tsx", element: "program-element:7n4kxc" }]);
    expect(encodeAnchors([{ file: "src/r.tsx", element: "program-element:7n4kxc" }])).toBe("src/r.tsx@el:program-element:7n4kxc");
    expect(parseAnchors(undefined)).toEqual([]);
  });

  it("keeps a two-anchor value in the location and drops an invalid one", () => {
    const loc = parseLocation(`?repo=/r&view=graph&anchor=${encodeURIComponent("src/a.tsx@A:3|src/c.ts@c:10")}&dir=forward`);
    expect(loc.anchor).toBe("src/a.tsx@A:3|src/c.ts@c:10");
    expect(loc.dir).toBe("forward");
    expect(parseLocation(`?repo=/r&view=graph&anchor=${encodeURIComponent("src/a.tsx@A:3|bad")}`).anchor).toBeUndefined();
  });
});
