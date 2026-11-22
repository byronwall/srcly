import type * as TypeScript from "typescript";
import { asFunctionLike } from "./program-evidence-support";

type Site = TypeScript.CallExpression | TypeScript.NewExpression;

/**
 * Instances of state kept per call or per instance (a closure's captured
 * variables, a class's fields). `madeBy` names the call or `new` a receiver
 * came from, which the slice uses to keep a walk in one instance
 * (`InstanceTag`). `manyInstances` says whether a factory has more than one
 * call site, or a class more than one `new` (its own or a subclass's): a step
 * the walk cannot pin to one instance is then assumed, not proven.
 *
 * Sites are found by the callee's name in one syntactic pass, then resolved
 * by the checker; a function reached only through an alias is not counted.
 */
export class InstanceSites {
  private byName: Map<string, Site[]> | null = null;
  private subclassesByName: Map<string, TypeScript.ClassLikeDeclaration[]> | null = null;
  private readonly many = new Map<TypeScript.Node, boolean>();
  private readonly factories = new Map<TypeScript.Node, TypeScript.FunctionLikeDeclaration | null>();

  constructor(
    private readonly ts: typeof TypeScript,
    private readonly checker: TypeScript.TypeChecker,
    private readonly files: readonly TypeScript.SourceFile[],
  ) {}

  /** A factory (a function) with more than one call site, or a class with more than one `new`. */
  manyInstances(declaration: TypeScript.Node): boolean {
    const known = this.many.get(declaration);
    if (known !== undefined) return known;
    this.many.set(declaration, false);
    const many = this.count(declaration, 2) > 1;
    this.many.set(declaration, many);
    return many;
  }

  /**
   * The function around `fn` whose call made it (a factory), when `fn` reads a
   * variable that function declares: a closure's captured state. Null for a
   * function that captures nothing from an enclosing function.
   */
  capturingFactory(fn: TypeScript.FunctionLikeDeclaration): TypeScript.FunctionLikeDeclaration | null {
    const known = this.factories.get(fn);
    if (known !== undefined) return known;
    const factory = this.findCapturingFactory(fn);
    this.factories.set(fn, factory);
    return factory;
  }

  private findCapturingFactory(fn: TypeScript.FunctionLikeDeclaration): TypeScript.FunctionLikeDeclaration | null {
    let factory: TypeScript.FunctionLikeDeclaration | null = null;
    for (let node: TypeScript.Node | undefined = fn.parent; node; node = node.parent) {
      factory = asFunctionLike(this.ts, node);
      if (factory) break;
      if (this.ts.isClassLike(node)) return null;
    }
    if (!factory) return null;
    const outer = factory;
    let captures = false;
    const visit = (node: TypeScript.Node): void => {
      if (captures) return;
      if (this.ts.isIdentifier(node)) {
        const symbol = this.checker.getSymbolAtLocation(node);
        const declared = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
        if (declared && within(declared, outer) && !within(declared, fn) && !asFunctionLike(this.ts, declared)) captures = true;
        return;
      }
      this.ts.forEachChild(node, visit);
    };
    if (fn.body) visit(fn.body);
    return captures ? outer : null;
  }

  /**
   * The call or `new` whose result `expression` holds: the expression itself,
   * `x` after `const x = make(…)`, `get` after `const { get } = make(…)`, an
   * imported `const`. `this` for the `this` keyword. Null for anything else:
   * a `let`, a parameter, a field, an element of an array.
   */
  madeBy(expression: TypeScript.Expression): Site | "this" | null {
    const ts = this.ts;
    let node: TypeScript.Node = expression;
    for (let step = 0; step < 8; step++) {
      while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) node = (node as TypeScript.ParenthesizedExpression).expression;
      if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) return node;
      if (!ts.isIdentifier(node)) return null;
      let symbol = this.checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
      if (symbol?.declarations?.length !== 1) return null;
      let declaration: TypeScript.Node = symbol.declarations[0]!;
      // `const { get } = make(…)`: each destructured name came from that one call's object.
      if (ts.isBindingElement(declaration)) {
        if (declaration.dotDotDotToken || !ts.isObjectBindingPattern(declaration.parent)) return null;
        declaration = declaration.parent.parent;
      }
      if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return null;
      if (!(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)) return null;
      node = declaration.initializer;
    }
    return null;
  }

  private count(declaration: TypeScript.Node, limit: number): number {
    const ts = this.ts;
    const fn = asFunctionLike(ts, declaration);
    if (fn) {
      // Named by its own declaration, not by a wrapper's call around it (`const useStore = create((set) => …)` names what `create` returns).
      const name = fn.name ?? (ts.isVariableDeclaration(fn.parent) && fn.parent.initializer === fn ? fn.parent.name : null);
      // An anonymous function run where it is written (`(() => …)()`) runs once; any other may run any number of times.
      if (!name || !ts.isIdentifier(name)) return isRunInPlace(ts, fn) ? 1 : limit;
      return this.sitesOf(name.text, name, false, limit);
    }
    if (ts.isClassLike(declaration) && declaration.name) {
      let total = this.sitesOf(declaration.name.text, declaration.name, true, limit);
      for (const sub of this.subclasses(declaration.name.text)) {
        if (total >= limit) break;
        const base = sub.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
        if (base && this.resolve(base) === this.resolve(declaration.name)) total += this.count(sub, limit - total);
      }
      return total;
    }
    return limit;
  }

  private sitesOf(name: string, declared: TypeScript.Node, constructs: boolean, limit: number): number {
    const target = this.resolve(declared);
    if (!target) return limit;
    let total = 0;
    for (const site of this.index().get(name) ?? []) {
      if (constructs !== this.ts.isNewExpression(site)) continue;
      if (this.resolve(calleeName(this.ts, site.expression)!) === target && ++total >= limit) break;
    }
    return total;
  }

  private subclasses(name: string): TypeScript.ClassLikeDeclaration[] {
    this.index();
    return this.subclassesByName!.get(name) ?? [];
  }

  private resolve(node: TypeScript.Node): TypeScript.Symbol | undefined {
    const symbol = this.checker.getSymbolAtLocation(node);
    return symbol && symbol.flags & this.ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
  }

  private index(): Map<string, Site[]> {
    if (this.byName) return this.byName;
    const ts = this.ts;
    const byName = new Map<string, Site[]>();
    const subclasses = new Map<string, TypeScript.ClassLikeDeclaration[]>();
    const visit = (node: TypeScript.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const name = calleeName(ts, node.expression);
        if (name) byName.set(name.text, [...(byName.get(name.text) ?? []), node]);
      }
      if (ts.isClassLike(node)) {
        const base = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
        const name = base ? calleeName(ts, base) : null;
        if (name) subclasses.set(name.text, [...(subclasses.get(name.text) ?? []), node]);
      }
      ts.forEachChild(node, visit);
    };
    for (const file of this.files) if (!file.isDeclarationFile) visit(file);
    this.subclassesByName = subclasses;
    this.byName = byName;
    return byName;
  }
}

function within(node: TypeScript.Node, outer: TypeScript.Node): boolean {
  return node.getSourceFile() === outer.getSourceFile() && node.pos >= outer.pos && node.end <= outer.end;
}

/** The name a callee ends in: `f`, `x.f`, `new F`. */
function calleeName(ts: typeof TypeScript, expression: TypeScript.Expression): TypeScript.Identifier | null {
  while (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
  if (ts.isIdentifier(expression)) return expression;
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) return expression.name;
  return null;
}

function isRunInPlace(ts: typeof TypeScript, fn: TypeScript.FunctionLikeDeclaration): boolean {
  let node: TypeScript.Node = fn;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  return ts.isCallExpression(node.parent) && node.parent.expression === node;
}
