import type * as TypeScript from "typescript";

/** One binding of a variable: its declaration's initializer, a parameter, or an assignment. `id` is null where the binding is already related (a parameter). */
export type VariableBinding = { id: string | null; node: TypeScript.Node };

/**
 * The bindings of one variable a read can see (reaching definitions, as the
 * Python helper's `link_loads` has them). A binding in the declaring
 * function reaches a read in that function when it ends before the read; a
 * binding or read in a nested function can meet at any time. When nothing
 * precedes the read, a loop can carry any binding back to it, so all of
 * them reach. Where every binding sits directly in the declaring body (no
 * branch, loop or closure), the last one before the read is the one it sees.
 */
export function reachingBindings(ts: typeof TypeScript, read: TypeScript.Node, declaration: TypeScript.Node, bindings: readonly VariableBinding[]): VariableBinding[] {
  const scopeOf = (node: TypeScript.Node) => ts.findAncestor(node.parent, (item) => ts.isFunctionLike(item) || ts.isSourceFile(item));
  const declaring = ts.isParameter(declaration) ? declaration.parent : scopeOf(declaration);
  const local = (binding: VariableBinding) => scopeOf(binding.node) === declaring || binding.node === declaration;
  const sameScope = scopeOf(read) === declaring;
  const before = bindings.filter((binding) => !sameScope || !local(binding) || binding.node.getEnd() <= read.getStart());
  if (before.length === 0) return [...bindings];
  if (!sameScope || before.length < 2 || !bindings.every((binding) => directlyIn(ts, binding.node, declaration))) return before;
  return [before.reduce((last, binding) => (binding.node.getEnd() > last.node.getEnd() ? binding : last))];
}

/** Whether a binding is a statement directly in the block that declares the variable, which is its function's body or the file. */
function directlyIn(ts: typeof TypeScript, binding: TypeScript.Node, declaration: TypeScript.Node): boolean {
  const statementOf = (node: TypeScript.Node) => ts.findAncestor(node, (item) => ts.isStatement(item) || ts.isParameter(item));
  const block = (node: TypeScript.Node | undefined) => {
    const statement = node && statementOf(node);
    if (!statement) return undefined;
    // A parameter belongs to its function's body.
    if (ts.isParameter(statement)) return (statement.parent as TypeScript.FunctionLikeDeclaration).body;
    return statement.parent;
  };
  const home = block(declaration);
  const body = home && (ts.isSourceFile(home) || (ts.isBlock(home) && ts.isFunctionLike(home.parent)));
  const own = binding === declaration || ts.isExpressionStatement(binding.parent) || (ts.isVariableDeclaration(binding) && ts.isVariableDeclarationList(binding.parent));
  return !!body && own && block(binding) === home;
}
