import type * as TypeScript from "typescript";
import { importedCallee, unwrap } from "./program-evidence-support";
import { resolveValue } from "./value-origin";

/**
 * React's imperative handle. `const handle = useRef(null)` is handed to a
 * component as `<Fillable ref={handle} />`; the component (`forwardRef((props,
 * ref) => …)`, through any `wraps` row) passes its `ref` to
 * `useImperativeHandle(ref, () => ({ fill }))`, and React sets
 * `handle.current` to what that factory returns. So `handle.current?.fill(x)`
 * runs the factory's `fill`. Returns each such member (a function value, a
 * method, or a name the factory's object holds), or [] for any other callee.
 * The ref must be a `const` from `useRef` and its elements must be in the
 * function that declares it, so every element it is handed to is seen.
 */
export function imperativeHandleMethods(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression): TypeScript.Node[] {
  const node = unwrap(ts, callee);
  if (!ts.isPropertyAccessExpression(node)) return [];
  const current = unwrap(ts, node.expression);
  if (!ts.isPropertyAccessExpression(current) || current.name.text !== "current") return [];
  const ref = unwrap(ts, current.expression);
  const symbol = ts.isIdentifier(ref) ? checker.getSymbolAtLocation(ref) : undefined;
  const declaration = symbol?.valueDeclaration;
  if (!symbol || !declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer || !(declaration.parent.flags & ts.NodeFlags.Const)) return [];
  const made = unwrap(ts, declaration.initializer);
  if (!ts.isCallExpression(made) || !isReact(ts, checker, made.expression, "useRef")) return [];
  const scope = ts.findAncestor(declaration, ts.isFunctionLike) ?? declaration.getSourceFile();
  const methods: TypeScript.Node[] = [];
  const visit = (child: TypeScript.Node) => {
    if (ts.isJsxAttribute(child) && child.name.getText() === "ref" && child.initializer && ts.isJsxExpression(child.initializer) && child.initializer.expression) {
      const value = unwrap(ts, child.initializer.expression);
      const element = child.parent.parent;
      if (ts.isIdentifier(value) && checker.getSymbolAtLocation(value) === symbol && (ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))) {
        const render = resolveValue(ts, checker, element.tagName as TypeScript.Expression)?.origin;
        if (render && ts.isFunctionLike(render)) methods.push(...handleMembers(ts, checker, render, node.name.text));
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(scope);
  return methods;
}

/** The member `name` of what each `useImperativeHandle(ref, factory)` in a render function returns, where `ref` is its second parameter. */
function handleMembers(ts: typeof TypeScript, checker: TypeScript.TypeChecker, render: TypeScript.SignatureDeclaration, name: string): TypeScript.Node[] {
  const parameter = render.parameters[1];
  const ref = parameter && ts.isIdentifier(parameter.name) ? checker.getSymbolAtLocation(parameter.name) : undefined;
  const body = "body" in render ? (render as TypeScript.FunctionLikeDeclaration).body : undefined;
  if (!ref || !body) return [];
  const members: TypeScript.Node[] = [];
  const visit = (child: TypeScript.Node) => {
    if (ts.isCallExpression(child) && isReact(ts, checker, child.expression, "useImperativeHandle") && child.arguments[0] && child.arguments[1]) {
      const handed = unwrap(ts, child.arguments[0]);
      const factory = resolveValue(ts, checker, child.arguments[1])?.origin;
      if (ts.isIdentifier(handed) && checker.getSymbolAtLocation(handed) === ref && factory && (ts.isArrowFunction(factory) || ts.isFunctionExpression(factory) || ts.isFunctionDeclaration(factory))) {
        for (const made of returned(ts, factory)) {
          const member = made.properties.find((property) => property.name && ts.isIdentifier(property.name) && property.name.text === name);
          if (member && ts.isPropertyAssignment(member)) members.push(member.initializer);
          else if (member && ts.isShorthandPropertyAssignment(member)) members.push(member.name);
          else if (member && ts.isMethodDeclaration(member)) members.push(member);
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(body);
  return members;
}

/** The object literals a function returns. */
function returned(ts: typeof TypeScript, fn: TypeScript.FunctionLikeDeclaration): TypeScript.ObjectLiteralExpression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) {
    const made = unwrap(ts, fn.body);
    return ts.isObjectLiteralExpression(made) ? [made] : [];
  }
  const found: TypeScript.ObjectLiteralExpression[] = [];
  const visit = (child: TypeScript.Node) => {
    if (ts.isFunctionLike(child)) return;
    const made = ts.isReturnStatement(child) && child.expression ? unwrap(ts, child.expression) : undefined;
    if (made && ts.isObjectLiteralExpression(made)) found.push(made);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

function isReact(ts: typeof TypeScript, checker: TypeScript.TypeChecker, callee: TypeScript.Expression, name: string): boolean {
  const imported = importedCallee(ts, checker, callee);
  return imported?.module === "react" && imported.name === name;
}
