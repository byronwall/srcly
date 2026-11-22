// Keyed stores (a `keyed` row, migration stage 4b in
// docs/research/dataflow-library-models-2026-11): a call writes, reads or
// clears an entry of a store under a key. A write and a read join when they
// reach the same store with the same key. A context is a store whose key is
// the context object and whose writes are its providers (`store:
// "providers"`); the query cache and `localStorage` are their receiver
// (`store: "Argument[this]"`). These readers find a call's store, key and
// paths; the collector emits the joins.
import type * as TypeScript from "typescript";
import type { LibraryModelRow } from "./library-models";
import { unwrap } from "./program-evidence-support";
import { resolveValue } from "./value-origin";

/** The row when it is `keyed`, else null. */
export function keyedRow(row: LibraryModelRow | null): LibraryModelRow | null {
  return row?.model === "keyed" ? row : null;
}

/** Whether a row makes a context: a `providers` store whose call is its own key (`createContext`). */
export function makesContext(row: LibraryModelRow | null): boolean {
  return row?.model === "keyed" && row.store === "providers" && row.key === "ReturnValue";
}

/** Whether a row reads a context: a `providers` store keyed by an argument, whose value is the entry (`useContext(Ctx)`). */
export function readsContext(row: LibraryModelRow | null): boolean {
  return row?.model === "keyed" && row.store === "providers" && row.key === "Argument[0]" && !!row.reads?.includes("ReturnValue");
}

/**
 * Whether a JSX tag on a context provides it: `<Ctx.Provider value>` when a
 * write is `ReturnValue.Member[Provider].Parameter[0].Member[value]`, and
 * `<Ctx value>` (React 19) when one is `ReturnValue.Parameter[0].Member[value]`.
 * `member` is the property the tag names on the context, or null for the context itself.
 */
export function providesAs(row: LibraryModelRow, member: string | null): boolean {
  const writes = Array.isArray(row.writes) ? row.writes : [];
  return writes.includes(member === null ? "ReturnValue.Parameter[0].Member[value]" : `ReturnValue.Member[${member}].Parameter[0].Member[value]`);
}

/** The argument a context's default is at (`createContext(default)`), or null. */
export function fallbackArgument(row: LibraryModelRow): number | null {
  const match = /^Argument\[(\d+)\]$/.exec(row.fallback?.[0] ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * A key: its parts, each a constant's text or null where it is computed.
 * A scalar key has one part; an array key (`["items", id]`) one per element.
 * `text` is the key as written, for a reason that names it.
 */
export type Key = { array: boolean; parts: (string | null)[]; text: string };

/** How two keys join: never, as proven (every part constant and equal), or as assumed (some part computed). */
export function keysJoin(a: Key, b: Key): "none" | "proven" | "assumed" {
  // A computed key that is no array literal may be any key.
  const any = (key: Key) => !key.array && key.parts[0] === null;
  if (any(a) || any(b)) return "assumed";
  if (a.array !== b.array || a.parts.length !== b.parts.length) return "none";
  let computed = false;
  for (let index = 0; index < a.parts.length; index++) {
    const [x, y] = [a.parts[index], b.parts[index]];
    if (x === null || y === null) computed = true;
    else if (x !== y) return "none";
  }
  return computed ? "assumed" : "proven";
}

/** The value of a constant scalar: a literal, or anything its type says is one literal (`const LIKES = "likes"`). Null when computed. */
function constant(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): string | null {
  const node = unwrap(ts, expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return JSON.stringify(node.text);
  if (ts.isNumericLiteral(node)) return node.text;
  const type = checker.getTypeAtLocation(node);
  if (type.isStringLiteral()) return JSON.stringify(type.value);
  if (type.isNumberLiteral()) return String(type.value);
  return null;
}

/** The array literal a key is: written in place, or held by a `const` (`const KEY = ["todos"]`). */
function arrayLiteral(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): TypeScript.ArrayLiteralExpression | null {
  const node = unwrap(ts, expression);
  if (ts.isArrayLiteralExpression(node)) return node;
  const resolved = resolveValue(ts, checker, node);
  const declaration = resolved?.declaration;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) || !declaration.initializer) return null;
  const initializer = unwrap(ts, declaration.initializer);
  return ts.isArrayLiteralExpression(initializer) ? initializer : null;
}

/** The key an expression is. A spread in an array key makes its length unknown: the whole key is computed. */
export function keyOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, expression: TypeScript.Expression): Key {
  const text = expression.getText().slice(0, 80);
  const array = arrayLiteral(ts, checker, expression);
  if (!array) return { array: false, parts: [constant(ts, checker, expression)], text };
  if (array.elements.some((element) => ts.isSpreadElement(element))) return { array: false, parts: [null], text };
  return { array: true, parts: array.elements.map((element) => constant(ts, checker, element)), text };
}

/** The expression at a key path of a call: `Argument[n]`, or a member of it (`Argument[0].Member[queryKey]`). Null when the call does not write it in place. */
export function keyExpression(ts: typeof TypeScript, call: TypeScript.CallExpression, path: string): TypeScript.Expression | null {
  const match = /^Argument\[(\d+)\](?:\.Member\[(\w+)\])?$/.exec(path);
  const argument = match ? call.arguments[Number(match[1])] : undefined;
  if (!argument || !match![2]) return argument ?? null;
  const object = unwrap(ts, argument);
  if (!ts.isObjectLiteralExpression(object)) return null;
  const property = object.properties.find((item) => item.name && ts.isIdentifier(item.name) && item.name.text === match![2]);
  return property && ts.isPropertyAssignment(property) ? property.initializer : property && ts.isShorthandPropertyAssignment(property) ? property.name : null;
}

/**
 * The store a receiver is (`store: "Argument[this]"`): a global the
 * standard library declares (`localStorage`, `window.sessionStorage`), the
 * object one `new` makes, or the value a call's row hands back
 * (`useQueryClient()`, the client its provider holds). Null when the receiver
 * is none of these: such a call joins nothing.
 */
export function receiverStore(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  receiver: TypeScript.Expression,
  rowOf: (callee: TypeScript.Expression) => LibraryModelRow | null,
  keyOfNode: (node: TypeScript.Node) => string,
): string | null {
  const node = unwrap(ts, receiver);
  const name = ts.isIdentifier(node) ? node : ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && /^(window|globalThis|self)$/.test(node.expression.text) ? node.name : null;
  const declaration = name ? checker.getSymbolAtLocation(name)?.declarations?.[0] : undefined;
  if (name && declaration?.getSourceFile().hasNoDefaultLib) return `global:${name.text}`;
  const origin = resolveValue(ts, checker, node)?.origin ?? node;
  const value = ts.isExpression(origin) ? unwrap(ts, origin) : origin;
  if (ts.isNewExpression(value)) return keyOfNode(value);
  if (!ts.isCallExpression(value)) return null;
  const row = rowOf(value.expression);
  return row && row.model !== "keyed" ? `row:${row.module}#${row.name ?? row.member}` : null;
}
