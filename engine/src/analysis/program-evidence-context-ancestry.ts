import type * as TypeScript from "typescript";

/**
 * The providers of one context above a reader. `values` are the nearest
 * providers found on resolved mounts; `fallback` says some mount may have no
 * provider above it, so the context's default is a value too. Each `open`
 * entry is a mount that is not known: any provider may be above it, except one
 * inside the components walked through on the way there, which are known not
 * to wrap it.
 */
export type ContextAbove = { values: Set<TypeScript.Expression>; fallback: boolean; open: TypeScript.Node[][] };

export type ContextAncestryHost = {
  ts: typeof TypeScript;
  /** The context key a JSX tag provides (`<Ctx.Provider>`, React's `<Ctx>`), or null. */
  provided(tag: TypeScript.JsxTagNameExpression): string | null;
  /** The in-project function a JSX tag renders, or null. */
  component(tag: TypeScript.JsxTagNameExpression): TypeScript.FunctionLikeDeclaration | null;
  /** Every reference to a declared name in the program, or null when they cannot be listed. */
  references(name: TypeScript.Identifier): readonly TypeScript.Node[] | null;
};

const DEPTH = 24;
const OPEN = 8;
const unknown = (): ContextAbove => ({ values: new Set(), fallback: true, open: [[]] });

/** Whether a provider's value may be what a reader with these providers above it gets. */
export function contextApplies(above: ContextAbove, value: TypeScript.Expression): boolean {
  if (above.values.has(value)) return true;
  return above.open.some((walked) => !walked.some((holder) => holder.pos <= value.pos && value.end <= holder.end && holder.getSourceFile() === value.getSourceFile()));
}

/**
 * Finds the providers above a `useContext` call from the source tree: walk out
 * to the nearest provider, or to the component or hook that holds the call,
 * and then out from each place that component is rendered or the hook called.
 */
export class ContextAncestry {
  private readonly holders = new Map<string, Map<TypeScript.Node, ContextAbove>>();
  private readonly provides = new Map<string, Map<TypeScript.Node, boolean>>();

  constructor(private readonly host: ContextAncestryHost) {}

  above(node: TypeScript.Node, context: string): ContextAbove {
    return this.walk(node, context, 0);
  }

  private walk(node: TypeScript.Node, context: string, depth: number): ContextAbove {
    const { ts } = this.host;
    let passedFunction = false;
    let inJsx = ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
    let previous = node;
    for (let at = node.parent; at; previous = at, at = at.parent) {
      inJsx ||= ts.isJsxElement(at) || ts.isJsxFragment(at);
      if (ts.isJsxElement(at) && previous !== at.openingElement) {
        const tag = at.openingElement.tagName;
        if (this.host.provided(tag) === context) {
          const value = providedValue(ts, at.openingElement);
          return { values: new Set(value ? [value] : []), fallback: false, open: [] };
        }
        // A component that takes children may wrap them in a provider of its own.
        const component = this.host.component(tag);
        if (component && this.mayProvide(component, context, depth)) return unknown();
      }
      // A render prop runs where the component it is given calls it.
      if (ts.isJsxAttribute(at)) return unknown();
      if (ts.isFunctionDeclaration(at)) return at.name ? this.holder(at.name, at, context, depth) : unknown();
      if (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) {
        // `render(() => <App />)` and `items.map(…)` run in place; a function kept anywhere else may run under any provider.
        if (!ts.isCallExpression(at.parent) && !ts.isJsxExpression(at.parent) && !ts.isVariableDeclaration(at.parent)) return unknown();
        passedFunction = true;
      }
      if (ts.isVariableDeclaration(at)) {
        // `const Row = () => …` or `memo(() => …)` names a component; `const el = <Reader />` renders wherever `el` goes.
        if (passedFunction) return ts.isIdentifier(at.name) ? this.holder(at.name, at, context, depth) : unknown();
        if (inJsx) return unknown();
      }
      if (ts.isClassLike(at) || ts.isMethodDeclaration(at)) return unknown();
    }
    return { values: new Set(), fallback: true, open: [] };
  }

  /** The providers above every place a component is rendered or a hook is called. */
  private holder(name: TypeScript.Identifier, declaration: TypeScript.Node, context: string, depth: number): ContextAbove {
    const memo = this.holders.get(context) ?? new Map<TypeScript.Node, ContextAbove>();
    this.holders.set(context, memo);
    const known = memo.get(declaration);
    if (known) return known;
    // A holder reached again on its own path renders itself: its mounts are not known.
    memo.set(declaration, unknown());
    const found = depth < DEPTH ? this.mounts(name, context, depth) : unknown();
    // Providers inside this holder that the walk did not pass through do not wrap the reader.
    const result = { ...found, open: found.open.map((walked) => [declaration, ...walked]) };
    memo.set(declaration, result);
    return result;
  }

  private mounts(name: TypeScript.Identifier, context: string, depth: number): ContextAbove {
    const { ts } = this.host;
    const references = this.host.references(name);
    if (!references) return unknown();
    const merged: ContextAbove = { values: new Set(), fallback: false, open: [] };
    for (const reference of references) {
      if (reference === name) continue;
      const parent = reference.parent;
      if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isExportSpecifier(parent) || ts.isJsxClosingElement(parent)) continue;
      let site: TypeScript.Node | null = null;
      if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === reference) site = ts.isJsxOpeningElement(parent) ? parent.parent : parent;
      else if (ts.isCallExpression(parent) && parent.expression === reference) site = parent;
      // Handed on as a value (`routes = [{ component: Page }]`), it may render under any provider.
      const above = site ? this.walk(site, context, depth + 1) : unknown();
      for (const value of above.values) merged.values.add(value);
      merged.fallback ||= above.fallback;
      merged.open.push(...above.open);
    }
    // Rendered nowhere the program shows (an exported page), it may sit under any provider, or none.
    if (!merged.values.size && !merged.fallback) return unknown();
    if (merged.open.length > OPEN) merged.open = [[]];
    return merged;
  }

  /** Whether a component's body renders a provider of this context, itself or through a component it renders. */
  private mayProvide(component: TypeScript.FunctionLikeDeclaration, context: string, depth: number): boolean {
    const memo = this.provides.get(context) ?? new Map<TypeScript.Node, boolean>();
    this.provides.set(context, memo);
    const known = memo.get(component);
    if (known !== undefined) return known;
    memo.set(component, true);
    const { ts } = this.host;
    let found = depth >= DEPTH;
    const visit = (node: TypeScript.Node) => {
      if (found) return;
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (this.host.provided(node.tagName) === context) found = true;
        const inner = found ? null : this.host.component(node.tagName);
        if (inner && inner !== component && this.mayProvide(inner, context, depth + 1)) found = true;
      }
      ts.forEachChild(node, visit);
    };
    if (component.body) visit(component.body);
    memo.set(component, found);
    return found;
  }
}

function providedValue(ts: typeof TypeScript, opening: TypeScript.JsxOpeningElement): TypeScript.Expression | null {
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== "value") continue;
    const initializer = attribute.initializer;
    if (initializer && ts.isJsxExpression(initializer)) return initializer.expression ?? null;
    return initializer && ts.isStringLiteral(initializer) ? initializer : null;
  }
  return null;
}
