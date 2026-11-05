from pathlib import Path

from app.services.symbols.index import build_symbol_index


def write(root: Path, rel: str, text: str) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def refs(index):
    return {(r.source, r.kind, r.target, r.resolution) for r in index.references}


def test_members_nested_functions_and_module_code_are_symbols(tmp_path: Path):
    write(
        tmp_path,
        "src/store.ts",
        "\n".join(
            [
                "export class Store {",
                "  private count = 0;",
                "  bump(n: number) { this.count += n; this.save(); }",
                "  save() { return this.count; }",
                "}",
                "export function outer() {",
                "  const inner = () => 1;",
                "  function named() { return inner(); }",
                "  return named();",
                "}",
                "export const api = { get() { return outer(); } };",
                "outer();",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    s = idx.symbols
    assert s["src/store.ts#Store.bump"].kind == "method" and s["src/store.ts#Store.bump"].container == "src/store.ts#Store"
    assert s["src/store.ts#Store.count"].kind == "field"
    assert s["src/store.ts#outer.inner"].kind == "function" and s["src/store.ts#outer.inner"].container == "src/store.ts#outer"
    assert s["src/store.ts#outer.named"].container == "src/store.ts#outer"
    assert s["src/store.ts#api.get"].kind == "method" and s["src/store.ts#api.get"].container == "src/store.ts#api"
    assert s["src/store.ts"].kind == "module"
    r = refs(idx)
    assert ("src/store.ts#Store.bump", "write", "src/store.ts#Store.count", "exact") in r
    assert ("src/store.ts#Store.bump", "call", "src/store.ts#Store.save", "exact") in r
    assert ("src/store.ts#Store.save", "read", "src/store.ts#Store.count", "exact") in r
    assert ("src/store.ts#outer.named", "call", "src/store.ts#outer.inner", "exact") in r
    assert ("src/store.ts#outer", "call", "src/store.ts#outer.named", "exact") in r
    assert ("src/store.ts#api.get", "call", "src/store.ts#outer", "exact") in r
    assert ("src/store.ts", "call", "src/store.ts#outer", "exact") in r
    # A call is one reference, not a call plus a read of the callee.
    assert not any(k == "read" and t == "src/store.ts#outer" for _s, k, t, _r in r)


def test_cross_file_references_through_imports_barrels_and_namespaces(tmp_path: Path):
    write(tmp_path, "src/base.ts", "export class Base { row() { return 1; } }\nexport function helper() {}\nexport interface Opts { id: string }\n")
    write(tmp_path, "src/index.ts", 'export * from "./base";\n')
    write(tmp_path, "src/util.ts", "export function log() {}\nexport const LIMIT = 3;\n")
    write(
        tmp_path,
        "src/app.tsx",
        "\n".join(
            [
                'import { Base, helper, type Opts } from "./index";',
                'import * as util from "./util";',
                "export class Store extends Base implements Opts {",
                "  id = '';",
                "  run() { super.row(); helper(); util.log(); return util.LIMIT; }",
                "}",
                "export const store = new Store();",
                "export function Widget(s: Store) { s.run(); store.run(); return <Panel />; }",
                "export type Id = Opts['id'];",
                "function Panel() { return null; }",
            ]
        ),
    )
    idx = build_symbol_index(tmp_path, use_cache=False)
    r = refs(idx)
    assert ("src/app.tsx#Store", "extends", "src/base.ts#Base", "exact") in r
    assert ("src/app.tsx#Store", "implements", "src/base.ts#Opts", "exact") in r
    assert ("src/app.tsx#Store.run", "call", "src/base.ts#Base.row", "exact") in r  # super → the base
    assert ("src/app.tsx#Store.run", "call", "src/base.ts#helper", "exact") in r
    assert ("src/app.tsx#Store.run", "call", "src/util.ts#log", "exact") in r
    assert ("src/app.tsx#Store.run", "read", "src/util.ts#LIMIT", "exact") in r
    assert ("src/app.tsx#store", "instantiate", "src/app.tsx#Store", "exact") in r
    assert ("src/app.tsx#Widget", "call", "src/app.tsx#Store.run", "typed") in r  # `s: Store`
    assert ("src/app.tsx#Widget", "call", "src/app.tsx#Panel", "exact") in r  # JSX
    assert ("src/app.tsx#Id", "type", "src/base.ts#Opts", "exact") in r
    assert idx.symbols["src/app.tsx#store"].typed_as == "src/app.tsx#Store"


def test_untyped_receivers_resolve_by_unique_member_name_only(tmp_path: Path):
    write(tmp_path, "a.ts", "export class A { only() {} shared() {} }\n")
    write(tmp_path, "b.ts", "export class B { shared() {} }\n")
    write(tmp_path, "use.ts", "export function f(x) { x.only(); x.shared(); x.nothing(); }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    r = refs(idx)
    assert ("use.ts#f", "call", "a.ts#A.only", "name") in r
    assert not any(t.endswith("shared") for _s, _k, t, _r in r)  # ambiguous: dropped
    assert idx.unresolved_members == 1  # `shared` exists and could not be pinned; `nothing` is nobody's member


def test_name_resolution_never_claims_builtin_members_or_property_reads(tmp_path: Path):
    write(tmp_path, "a.ts", "export class Index { has(k: string) { return true; } location = 1; }\n")
    write(tmp_path, "use.ts", "export function f(set: Set<string>, x) { set.has('a'); return x.location; }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    assert not any(t.startswith("a.ts#Index.") for _s, _k, t, _r in refs(idx))


def test_locals_shadow_and_declarations_are_not_references(tmp_path: Path):
    write(tmp_path, "x.ts", "export const value = 1;\nexport function f(value: number) { return value + 1; }\nexport function g() { const value = 2; return value; }\nexport function h() { return value; }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    r = refs(idx)
    assert ("x.ts#h", "read", "x.ts#value", "exact") in r
    assert not any(s in ("x.ts#f", "x.ts#g") for s, _k, _t, _r in r)


def test_neighbourhood_merges_edges_and_counts_hops(tmp_path: Path):
    write(tmp_path, "m.ts", "export function a() { b(); b(); }\nexport function b() { c(); }\nexport function c() {}\nexport function d() { a(); }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    g = idx.neighbourhood("m.ts#b", hops=1)
    assert g is not None
    assert {n.id for n in g.nodes} == {"m.ts#a", "m.ts#b", "m.ts#c"}
    ab = next(e for e in g.edges if e.source == "m.ts#a")
    assert ab.count == 2 and ab.lines == [1] and ab.kind == "call" and ab.resolution == "exact"
    focus = next(n for n in g.nodes if n.id == "m.ts#b")
    assert focus.hop == 0 and focus.in_count == 1 and focus.out_count == 1
    two = idx.neighbourhood("m.ts#b", hops=2)
    assert {n.id for n in two.nodes} == {"m.ts#a", "m.ts#b", "m.ts#c", "m.ts#d"}
    assert idx.neighbourhood("m.ts#missing") is None
    out_only = idx.neighbourhood("m.ts#b", hops=2, direction="out")
    assert {n.id for n in out_only.nodes} == {"m.ts#b", "m.ts#c"}


def test_search_ranks_exact_then_prefix_then_contains(tmp_path: Path):
    write(tmp_path, "s.ts", "export class Store { bump() {} }\nexport function storeAll() {}\nexport function restore() {}\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    hits = [h.id for h in idx.search("store")]
    assert hits[0] == "s.ts#Store" and hits[1] == "s.ts#storeAll" and "s.ts#restore" in hits
    assert [h.id for h in idx.search("bump")] == ["s.ts#Store.bump"]
    assert idx.search("") == []


def test_index_is_cached_by_mtime(tmp_path: Path):
    write(tmp_path, "c.ts", "export function a() {}\n")
    first = build_symbol_index(tmp_path)
    assert build_symbol_index(tmp_path) is first
    write(tmp_path, "c.ts", "export function a() {}\nexport function b() { a(); }\n")
    import os

    os.utime(tmp_path / "c.ts", (0, 10**9))
    assert build_symbol_index(tmp_path) is not first


def test_neighbourhood_draws_members_with_the_focus_and_opens_hops(tmp_path: Path):
    write(tmp_path, "s.ts", "export class Store { bump() { this.save(); } save() {} }\nexport function caller() { new Store().bump(); }\nexport function outer() { caller(); }\nexport function far() { outer(); }\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    g = idx.neighbourhood("s.ts#Store", hops=1)
    ids = {n.id: n for n in g.nodes}
    assert ids["s.ts#Store.bump"].hop == 0 and ids["s.ts#Store.save"].hop == 0  # members drawn with the class
    assert ids["s.ts#caller"].hop == 1 and "s.ts#outer" not in ids
    without = idx.neighbourhood("s.ts#Store", hops=1, members=False)
    assert {n.id for n in without.nodes} == {"s.ts#Store", "s.ts#caller"}
    opened = idx.neighbourhood("s.ts#Store", hops=1, more=["s.ts#caller"])
    assert "s.ts#outer" in {n.id for n in opened.nodes} and "s.ts#far" not in {n.id for n in opened.nodes}
    module = idx.neighbourhood("s.ts", hops=1)
    assert {n.id for n in module.nodes if n.hop == 0} == {"s.ts", "s.ts#Store", "s.ts#caller", "s.ts#outer", "s.ts#far"}


def test_path_finds_the_shortest_chain_forward_then_backward(tmp_path: Path):
    write(tmp_path, "p.ts", "export function a() { b(); c(); }\nexport function b() { d(); }\nexport function c() { d(); d(); }\nexport function d() { e(); }\nexport function e() {}\nexport function lone() {}\n")
    idx = build_symbol_index(tmp_path, use_cache=False)
    p = idx.path("p.ts#a", "p.ts#e")
    assert p.found and p.direction == "forward" and p.steps == 3
    assert [n.id for n in p.nodes] == ["p.ts#a", "p.ts#b", "p.ts#d", "p.ts#e"]
    assert [n.hop for n in p.nodes] == [0, 1, 2, 3]
    assert [(e.source, e.target, e.kind) for e in p.edges] == [("p.ts#a", "p.ts#b", "call"), ("p.ts#b", "p.ts#d", "call"), ("p.ts#d", "p.ts#e", "call")]
    back = idx.path("p.ts#e", "p.ts#a")
    assert back.found and back.direction == "backward" and [n.id for n in back.nodes] == ["p.ts#e", "p.ts#d", "p.ts#b", "p.ts#a"]
    assert back.edges[0].source == "p.ts#d" and back.edges[0].target == "p.ts#e"
    none = idx.path("p.ts#a", "p.ts#lone")
    assert not none.found and none.direction is None and [n.id for n in none.nodes] == ["p.ts#a", "p.ts#lone"] and none.edges == []
    assert idx.path("p.ts#a", "p.ts#a").steps == 0
    assert idx.path("p.ts#a", "p.ts#nope") is None
    assert not idx.path("p.ts#a", "p.ts#e", kinds=["read"]).found


def test_refs_flags_and_stats(tmp_path: Path):
    write(tmp_path, "s.ts", "export function used() {}\nexport function big() {\n  return 1;\n}\nfunction small() {}\nexport function tested() {}\nexport function hub() {}\nfunction a() { used(); hub(); }\nfunction b() { hub(); a(); }\n")
    write(tmp_path, "s.test.ts", 'import { tested, hub } from "./s";\ntested(); hub();\n')
    idx = build_symbol_index(tmp_path, use_cache=False)
    by = {n.id: n for n in idx.neighbourhood("s.ts", hops=1).nodes}
    assert by["s.ts#big"].refs == "none" and by["s.ts#small"].refs == "none"
    assert by["s.ts#tested"].refs == "tests"
    assert by["s.ts#used"].refs is None and by["s.ts"].refs is None
    assert by["s.ts#b"].refs == "none"
    stats = idx.stats(limit=2)
    assert [h.id for h in stats.unreferenced] == ["s.ts#b", "s.ts#small"]  # private first, then by size, then id
    assert stats.unreferenced_count == 3 and stats.unreferenced_private == 2
    assert [h.id for h in stats.test_only] == ["s.ts#tested"] and stats.test_only_count == 1
    assert stats.hubs[0].id == "s.ts#hub" and stats.hubs[0].in_count == 3
    assert "s.ts#big" not in {h.id for h in stats.hubs}
    assert stats.unreferenced[0].lines == 1 and stats.unreferenced[0].exported is False
