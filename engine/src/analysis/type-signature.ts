import type * as TypeScript from "typescript";

/**
 * The access paths a package call's generic signature proposes, for a call
 * no row describes. A type parameter shared by two positions says they hold
 * the same type, not the same value, so every path is a hint (`type-signature`,
 * `assumed`), never proof:
 *
 * - `Argument[i] -> ReturnValue`: argument i's declared type is a type
 *   parameter the result uses (`useCallback<T>(cb: T): T`).
 * - `Argument[i].ReturnValue -> ReturnValue`: argument i is a function whose
 *   return shares a type parameter with the result (`useMemo<T>(fn: () => T): T`).
 * - `Argument[k] -> Argument[i].Parameter[j]`: argument k's declared type is a
 *   type parameter that parameter j of callback i uses (`watch<T>(value: T, fn: (v: T) => void)`).
 *
 * A value moves only from a position typed as the bare type parameter. An
 * argument whose type only holds one (`useContext<T>(ctx: Context<T>): T`)
 * proposes nothing: the value inside a container is not the
 * container's argument (a provider's value comes first). A signature with
 * no type parameters proposes nothing.
 */
export type TypePath = { from: string; to: string };

export function typeSignaturePaths(ts: typeof TypeScript, checker: TypeScript.TypeChecker, node: TypeScript.CallExpression): TypePath[] {
  const declaration = checker.getResolvedSignature(node)?.declaration;
  const file = declaration?.getSourceFile();
  if (!declaration || !file?.isDeclarationFile || file.hasNoDefaultLib || ts.isJSDocSignature(declaration)) return [];
  const generic = checker.getSignatureFromDeclaration(declaration);
  const own = new Set(generic?.getTypeParameters() ?? []);
  if (!generic || !own.size) return [];
  // The type parameters a type uses, through unions, type arguments and call signatures.
  const uses = (type: TypeScript.Type, depth = 0, out = new Set<TypeScript.Type>()): Set<TypeScript.Type> => {
    if (depth > 6) return out;
    if (type.flags & ts.TypeFlags.TypeParameter) {
      if (own.has(type as TypeScript.TypeParameter)) out.add(type);
      return out;
    }
    if (type.isUnionOrIntersection()) for (const item of type.types) uses(item, depth + 1, out);
    for (const item of type.aliasTypeArguments ?? []) uses(item, depth + 1, out);
    if ((type as TypeScript.ObjectType).objectFlags & ts.ObjectFlags.Reference) for (const item of checker.getTypeArguments(type as TypeScript.TypeReference)) uses(item, depth + 1, out);
    for (const signature of type.getCallSignatures()) uses(signature.getReturnType(), depth + 1, out);
    return out;
  };
  const shares = (a: Set<TypeScript.Type>, b: Set<TypeScript.Type>) => [...a].some((item) => b.has(item));
  const result = uses(generic.getReturnType());
  // An optional parameter's `undefined` dropped; a bare type parameter stays bare (never `T & {}`).
  const parameters = generic.getParameters().map((symbol) => {
    const type = checker.getTypeOfSymbol(symbol);
    return type.isUnion() ? checker.getNonNullableType(type) : type;
  });
  const signatures = (type: TypeScript.Type) => (type.flags & ts.TypeFlags.TypeParameter ? [] : type.getCallSignatures());
  const paths: TypePath[] = [];
  const add = (from: string, to: string) => {
    if (!paths.some((item) => item.from === from && item.to === to)) paths.push({ from, to });
  };
  parameters.forEach((type, index) => {
    if (index >= node.arguments.length) return;
    if (type.flags & ts.TypeFlags.TypeParameter) {
      if (result.has(type)) add(`Argument[${index}]`, "ReturnValue");
      return;
    }
    for (const signature of signatures(type)) {
      if (shares(uses(signature.getReturnType()), result)) add(`Argument[${index}].ReturnValue`, "ReturnValue");
      signature.getParameters().forEach((symbol, position) => {
        const taken = uses(checker.getTypeOfSymbol(symbol));
        parameters.forEach((other, from) => {
          if (from !== index && from < node.arguments.length && other.flags & ts.TypeFlags.TypeParameter && taken.has(other)) add(`Argument[${from}]`, `Argument[${index}].Parameter[${position}]`);
        });
      });
    }
  });
  return paths;
}
