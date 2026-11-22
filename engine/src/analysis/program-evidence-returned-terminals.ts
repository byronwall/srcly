import type * as TypeScript from "typescript";
import { frameworkRow } from "./framework-flows";
import type { LibraryModelRow } from "./library-models";
import { importedCallee, unwrap } from "./program-evidence-support";
import { resolveValue } from "./value-origin";

/**
 * A function a library call hands back, which is itself a terminal: a
 * `terminal` row with a `result` (`useNavigate`'s `navigate`, the setter half
 * of `useSearchParams`). The callee resolves, through the checker, to the
 * call's own value (`result: call`) or to the tuple element at that index
 * (`result: 1`). Null for any other callee.
 */
export function returnedTerminal(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): { row: LibraryModelRow; hook: string } | null {
  const origin = resolveValue(ts, checker, callee)?.origin;
  if (!origin) return null;
  const tuple = ts.isBindingElement(origin) && ts.isArrayBindingPattern(origin.parent) && ts.isVariableDeclaration(origin.parent.parent) ? origin.parent : null;
  const made = tuple ? (tuple.parent as TypeScript.VariableDeclaration).initializer : ts.isExpression(origin) ? origin : undefined;
  const call = made && unwrap(ts, made);
  if (!call || !ts.isCallExpression(call)) return null;
  const imported = importedCallee(ts, checker, call.expression);
  const row = imported ? frameworkRow(imported.module, imported.name) : null;
  const slot = tuple ? String(tuple.elements.indexOf(origin as TypeScript.BindingElement)) : "call";
  return row && imported && row.model === "terminal" && row.result === slot ? { row, hook: imported.name } : null;
}
