export type SymbolKind = "file" | "function" | "class" | "type" | "interface" | "object" | "jsx" | "imports";

// Kinds the analyzers fold into the name: "SortField (type)", "(class) Foo".
const SUFFIX_KINDS: Record<string, SymbolKind> = {
  type: "type",
  interface: "interface",
  class: "class",
  object: "object",
  obj: "object",
};

/** A symbol's kind and its name without the kind folded in. */
export function symbolKind(node: any): { kind: SymbolKind; name: string } {
  const raw = String(node?.name ?? "");
  if (node?.type === "file") return { kind: "file", name: raw };
  if (raw === "(imports)") return { kind: "imports", name: "imports" };
  const suffix = raw.match(/^(.*) \((type|interface|class|object|obj)\)$/);
  if (suffix) return { kind: SUFFIX_KINDS[suffix[2]], name: suffix[1] };
  const prefix = raw.match(/^\((class|async)\) (.*)$/);
  if (prefix) return { kind: prefix[1] === "class" ? "class" : "function", name: prefix[2] };
  if (raw.startsWith("<")) return { kind: "jsx", name: raw };
  if (node?.type === "class") return { kind: "class", name: raw };
  return { kind: "function", name: raw };
}
