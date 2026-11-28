// The language host over a TypeScript Program: nodes found by span, types
// from the checker, call sites from the Program's own references.
import path from "node:path";
import type * as TypeScript from "typescript";
import { createCallSiteIndex, type CallSiteIndex } from "./call-sites";
import { compilerSymbolId } from "../analysis/program-evidence-support";
import { builtinTsModel } from "../analysis/library-models";
import { cellCall, cellHas, cellSite, pairShaped } from "../analysis/cells";
import { scopeRole } from "./scope-roles";
import { callSitesOfElement, enclosingFunction, functionName, nodeAtSpan } from "./facts";
import type { BindingState, HostCandidate, LanguageHost, StateEffect } from "./host";
import { candidatesAt, sliceWhole, sourceFileFor, spanOf, type Span } from "./selection";
import type { TsTier1 } from "./session";

export function createTypescriptHost(tier1: TsTier1): LanguageHost {
  const { ts, program } = tier1;
  const checker = program.getTypeChecker();
  const root = path.resolve(tier1.args.root);
  let sites: CallSiteIndex | null = null;
  const typeTexts = new WeakMap<TypeScript.Node, string | null>();
  const scopes = new WeakMap<TypeScript.SignatureDeclaration, NonNullable<ReturnType<LanguageHost["scopeAt"]>>>();
  const sourceFile = (file: string) => program.getSourceFile(path.resolve(root, file));
  const nodeAt = (file: string, span: Span) => {
    const found = sourceFile(file);
    const node = found ? nodeAtSpan(ts, found, span) : null;
    return node && found ? { node, sourceFile: found } : null;
  };
  /**
   * Whether the code changes the object a binding names after it is bound:
   * written through any access chain (`=`, compound, `++`, `delete`), passed
   * as `Object.assign`'s target, handed whole to another name, or exported.
   */
  /** A target inside a destructuring assignment's pattern (`[doc.note.title] = …`). */
  const destructuredTarget = (target: TypeScript.Node) => {
    let node = target;
    while (ts.isArrayLiteralExpression(node.parent) || ts.isObjectLiteralExpression(node.parent) || ts.isPropertyAssignment(node.parent) || ts.isShorthandPropertyAssignment(node.parent) || ts.isSpreadElement(node.parent) || ts.isSpreadAssignment(node.parent)) node = node.parent;
    return node !== target && ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  };
  /** Whether a `break` in this statement can leave the switch it sits in (not one inside a nested loop, switch or function). */
  const breaks = (node: TypeScript.Node): boolean => {
    if (ts.isBreakStatement(node)) return !node.label;
    if (ts.isIterationStatement(node, false) || ts.isSwitchStatement(node) || ts.isFunctionLike(node)) return false;
    return !!ts.forEachChild(node, (child) => breaks(child) || undefined);
  };
  /** Whether running every statement in order always returns or throws. */
  const endsAlways = (statement: TypeScript.Statement | undefined): boolean => {
    if (!statement) return false;
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
    if (ts.isBlock(statement)) return endsAlways(statement.statements.at(-1));
    if (ts.isIfStatement(statement)) return !!statement.elseStatement && endsAlways(statement.thenStatement) && endsAlways(statement.elseStatement);
    // A switch with a default, whose every clause with statements ends (an empty clause falls into the next).
    if (ts.isSwitchStatement(statement)) {
      const clauses = statement.caseBlock.clauses;
      return clauses.some((clause) => ts.isDefaultClause(clause)) && clauses.every((clause, index) => clause.statements.length === 0 ? index < clauses.length - 1 : !clause.statements.some(breaks) && endsAlways(clause.statements.at(-1)));
    }
    return false;
  };
  /** A JSX tag that names a component as Solid's compiler reads it (`Editor`, `_Editor`, `ui.editor`), not a page element (`div`, `svg:rect`). */
  const componentTag = (tag: TypeScript.JsxTagNameExpression) => {
    if (ts.isJsxNamespacedName(tag)) return false;
    if (!ts.isIdentifier(tag)) return true;
    const first = tag.text[0];
    return first !== first.toLowerCase() || !/[a-z]/i.test(first);
  };
  /** A value that carries no object to change: every member of its type is a primitive. */
  const isPrimitive = (type: TypeScript.Type) => (type.isUnion() ? type.types : [type]).every((member) => (member.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.EnumLike | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) !== 0);
  // `await x` can be x itself (a value that is not a promise, or a promise that settles to it): the same object.
  const unwrap = (node: TypeScript.Node) => {
    let top = node;
    while (ts.isAsExpression(top.parent) || ts.isSatisfiesExpression(top.parent) || ts.isParenthesizedExpression(top.parent) || ts.isNonNullExpression(top.parent) || ts.isAwaitExpression(top.parent)) top = top.parent;
    return top;
  };
  /**
   * The one effect analysis for an object value: whether the code may change
   * the object this use names (a binding's use, or a getter's call `doc()`).
   * Read-only uses (a field read of a primitive, a test) say no; a write
   * through any access chain, or an escape (handed to a function, a
   * component, a container, out of a function) says yes. Handed to a plain
   * name (`const sub = doc()`), it is that name's uses that decide.
   */
  const changes = (use: TypeScript.Node, seen: Set<TypeScript.Node>): boolean => {
    // `export default state`, `export default (state as State)`.
    if (ts.isExportAssignment(unwrap(use).parent)) return true;
    // `x.a.b`, `x["a"]`: the access chain that starts at this use.
    let top: TypeScript.Node = unwrap(use);
    while ((ts.isPropertyAccessExpression(top.parent) || ts.isElementAccessExpression(top.parent)) && top.parent.expression === top) top = unwrap(top.parent);
    const up = top.parent;
    const assigned = ts.isBinaryExpression(up) && up.left === top && up.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && up.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    const stepped = (ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) && (up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken);
    const whole = top === unwrap(use);
    // Written (`x.a = …`, `x = …`, `[x.a] = …`, `({ x } = …)`, `for (x of …)`).
    if (assigned || stepped || ts.isDeleteExpression(up) || destructuredTarget(top) || ((ts.isForOfStatement(up) || ts.isForInStatement(up)) && up.initializer === top)) return true;
    // A primitive (`console.log(n.title)`, `string | undefined`) carries no object to change.
    const type = checker.getTypeAtLocation(top);
    if (isPrimitive(type)) return false;
    // A Solid DOM ref (`<input ref={refs.input} />`) assigns the element to it at mount.
    if (!whole && ts.isJsxExpression(up) && ts.isJsxAttribute(up.parent) && up.parent.name.getText() === "ref") return true;
    // Handed out of a function (`() => n`, `return n`, `yield n`), used as a parameter's default (`d = n`) or a class field's (`held = n`): written wherever that goes.
    if (ts.isReturnStatement(up) || ts.isYieldExpression(up) || (ts.isArrowFunction(up) && up.body === top) || ((ts.isParameter(up) || ts.isBindingElement(up) || ts.isPropertyDeclaration(up)) && up.initializer === top)) return true;
    // Shared with another holder: a fallback or branch (`incoming ?? x`), a copy that shares its members (`{ ...x }`), a container (`[x]`, `{ k: x }`).
    if (ts.isSpreadElement(up) || ts.isSpreadAssignment(up) || ts.isArrayLiteralExpression(up) || (ts.isPropertyAssignment(up) && up.initializer === top) || ts.isShorthandPropertyAssignment(up)) return true;
    if (ts.isBinaryExpression(up) && up.right === top || ts.isBinaryExpression(up) && up.left === top && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(up.operatorToken.kind)) return true;
    if (ts.isConditionalExpression(up) && up.condition !== top) return true;
    // Its own method called (`state.apply(patch)`), which may write it through `this`.
    if ((ts.isPropertyAccessExpression(top) || ts.isElementAccessExpression(top)) && ts.isCallExpression(up) && up.expression === top && !isPrimitive(checker.getTypeAtLocation(top.expression))) return true;
    // Handed to a component (`<Editor note={note} />`, `<Editor {...doc} />`), which may write it through its props.
    if (ts.isJsxExpression(up) && ts.isJsxAttribute(up.parent) && componentTag(up.parent.parent.parent.tagName)) return true;
    if (ts.isJsxSpreadAttribute(up) && componentTag(up.parent.parent.tagName)) return true;
    // Handed to a tag function (``tag`${note}` ``), which may write it.
    if (ts.isTemplateSpan(up) && ts.isTaggedTemplateExpression(up.parent.parent)) return true;
    // Handed to a function (which may write it: `rename(note)`, `Object.assign(note, …)`), or to another name (`const sub = doc.note`).
    if ((ts.isCallExpression(up) || ts.isNewExpression(up)) && up.arguments?.includes(top as TypeScript.Expression)) return true;
    if (ts.isVariableDeclaration(up) && up.initializer === top) return !ts.isIdentifier(up.name) || changedBinding(up, undefined, seen);
    return ts.isBinaryExpression(up) && up.right === top && up.operatorToken.kind === ts.SyntaxKind.EqualsToken;
  };
  /** `installed`: the assignment that put the object in the binding (`o = { … }`), which is no write to it. */
  const changedBinding = (declaration: TypeScript.VariableDeclaration | TypeScript.ParameterDeclaration, installed?: TypeScript.Node, seen = new Set<TypeScript.Node>()): boolean => {
    if (!ts.isIdentifier(declaration.name)) return true;
    // A name handed to itself (`a = b; b = a`) adds nothing new.
    if (seen.has(declaration)) return false;
    seen.add(declaration);
    const name = declaration.name;
    const symbol = checker.getSymbolAtLocation(name);
    if (!symbol) return true;
    if (ts.isVariableDeclaration(declaration) && (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0) return true;
    let found = false;
    const visit = (node: TypeScript.Node) => {
      if (found) return;
      // `export { state }` hands it to every importer, which may change it.
      if (ts.isExportSpecifier(node) && checker.getExportSpecifierLocalTargetSymbol(node) === symbol) found = true;
      // The assignment that installed the object is no write to it, unless its value goes on (`f(o = { … })`, `a = o = { … }`).
      else if (node === installed) found = !ts.isExpressionStatement(node.parent.parent);
      else if (ts.isIdentifier(node) && node !== name && node.text === name.text && (ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node)) === symbol && changes(node, seen)) found = true;
      else ts.forEachChild(node, visit);
    };
    // A local binding is used only in its own file; an exported one may be changed anywhere.
    visit(declaration.getSourceFile());
    return found;
  };
  /** Each use of a binding's name in its own file (a shorthand member `{ set }` included), not the name itself. */
  const usesOf = (name: TypeScript.Identifier) => {
    const symbol = checker.getSymbolAtLocation(name);
    const out: TypeScript.Identifier[] = [];
    if (!symbol) return out;
    const visit = (node: TypeScript.Node) => {
      if (ts.isIdentifier(node) && node !== name && node.text === name.text && (ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node)) === symbol) out.push(node);
      else if (ts.isExportSpecifier(node) && checker.getExportSpecifierLocalTargetSymbol(node) === symbol) out.push(node.name as TypeScript.Identifier);
      else ts.forEachChild(node, visit);
    };
    visit(name.getSourceFile());
    return out;
  };
  /** A type-only use (`typeof setDoc`), which runs nothing. */
  const typeOnly = (node: TypeScript.Node) => {
    for (let up: TypeScript.Node | undefined = node.parent; up; up = up.parent) {
      if (ts.isTypeNode(up)) return true;
      if (ts.isExpression(up) || ts.isStatement(up)) return false;
    }
    return false;
  };
  /** The expression under parentheses and type assertions: the value itself. */
  const inner = (node: TypeScript.Node) => {
    let at = node;
    while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at)) at = at.expression;
    return at;
  };
  /**
   * A store path key written as a literal (`"doc"`, `0`, `"doc" as const`), or null. A key known only from its type
   * is not one: a narrowed `let` can hold another value by the time the setter runs.
   */
  const literalKey = (node: TypeScript.Expression): string | null => {
    const key = inner(node);
    return ts.isStringLiteralLike(key) || ts.isNumericLiteral(key) ? key.text : null;
  };
  /** A value whose every type member can be called: a function the setter calls, never the value it stores. */
  const surelyCallable = (node: TypeScript.Node) => {
    const type = checker.getTypeAtLocation(node);
    return (type.isUnion() ? type.types : [type]).every((member) => member.getCallSignatures().length > 0);
  };
  const effects = new WeakMap<TypeScript.VariableDeclaration, StateEffect[] | null>();
  /**
   * The write-effect model of one state pair: every use of its setter and of
   * its value, classified once by the state they reach. A setter called
   * directly with a value is a write the slice holds; any other use of it
   * (handed on, bound, called with nothing, under a computed key) is one the
   * slice may not hold. A value handle's uses go through `changes`, the same
   * analysis `mutable` uses.
   */
  const pairEffects = (declaration: TypeScript.VariableDeclaration): StateEffect[] | null => {
    if (effects.has(declaration)) return effects.get(declaration)!;
    const site = cellSite(ts, checker, declaration);
    const pattern = declaration.name;
    let out: StateEffect[] | null = null;
    if (site && pairShaped(site.row) && ts.isArrayBindingPattern(pattern)) {
      out = [];
      const sourceFile = declaration.getSourceFile();
      const at = (node: TypeScript.Node) => spanOf(sourceFile, node);
      const add = (effect: StateEffect["effect"], node: TypeScript.Node, resolved: boolean, value: TypeScript.Node | null = null, prefix: string[] = []) => out!.push({ effect, span: at(node), value: value ? at(inner(value)) : null, resolved, prefix, merges: paths });
      const exported = (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
      // A setter that takes a path first (Solid's `setStore("doc", "title", v)`) merges a plain object into the old one, and its store is a read-only proxy.
      const paths = cellHas(site.row, "writes", "ReturnValue.Member[1].Parameter[0..]");
      const [first, second, ...rest] = pattern.elements;
      // A rest element, or a handle under a nested pattern, is a handle the model does not follow.
      if (rest.some((element) => !ts.isOmittedExpression(element)) || [first, second].some((element) => element && ts.isBindingElement(element) && (!ts.isIdentifier(element.name) || element.dotDotDotToken))) add("escape", pattern, false);
      const setter = second && ts.isBindingElement(second) && ts.isIdentifier(second.name) ? second.name : null;
      // The setter writes what it is handed: `ReturnValue.Member[1].Parameter[0]`. A dispatch (`useReducer`) writes only through its reducer.
      const writes = cellHas(site.row, "writes", "ReturnValue.Member[1].Parameter[0]");
      if (setter && writes) {
        if (exported) add("escape", setter, false);
        for (const use of usesOf(setter)) {
          if (typeOnly(use)) continue;
          const top = unwrap(use);
          const call = ts.isCallExpression(top.parent) && top.parent.expression === top ? top.parent : null;
          if (!call) {
            add("escape", use, false);
            continue;
          }
          const args = call.arguments;
          // Called with nothing, the setter stores undefined; a spread hands it values the model cannot place.
          if (!args.length || args.some((arg) => ts.isSpreadElement(arg))) {
            add("replace", call, false);
            continue;
          }
          const value = args[args.length - 1];
          const fn = ts.isArrowFunction(inner(value)) || ts.isFunctionExpression(inner(value));
          // A function made elsewhere (`setDoc(rename("NEW"))`): what it returns is stored, and the slice may not hold that return.
          if (!fn && surelyCallable(value)) {
            add("updater", call, false, value);
            continue;
          }
          if (!paths) {
            add(fn ? "updater" : "replace", call, true, value);
            continue;
          }
          const keys = args.slice(0, -1).map(literalKey);
          const computed = keys.indexOf(null);
          if (computed >= 0) {
            add("path", call, false, value, keys.slice(0, computed) as string[]);
            continue;
          }
          // Only at the root is an object always merged; under a path Solid merges only into an old plain object or array.
          const merged = !keys.length && ts.isObjectLiteralExpression(inner(value));
          add(fn ? "updater" : merged ? "merge" : "replace", call, true, value, keys as string[]);
        }
      }
      // What the value handle reads: the getter's call (`doc()`) or the value itself (React's `doc`). A store proxy rejects direct writes.
      const getter = first && ts.isBindingElement(first) && ts.isIdentifier(first.name) ? first.name : null;
      const accessor = cellHas(site.row, "reads", "ReturnValue.Member[0].ReturnValue");
      if (getter && !paths && (accessor || cellHas(site.row, "reads", "ReturnValue.Member[0]"))) {
        const valueType = accessor ? checker.getTypeAtLocation(getter).getCallSignatures()[0]?.getReturnType() : checker.getTypeAtLocation(getter);
        if (!valueType || !isPrimitive(valueType)) {
          if (exported) add("escape", getter, false);
          for (const use of usesOf(getter)) {
            if (typeOnly(use)) continue;
            const top = unwrap(use);
            const call = ts.isCallExpression(top.parent) && top.parent.expression === top ? top.parent : null;
            // A getter handed on (`<Child doc={doc} />`) may be called where the model does not look, and what it returns changed there.
            if (accessor && !call) add("escape", use, false);
            else if (changes(accessor ? call! : use, new Set())) add("alias", accessor ? call! : use, false);
          }
        }
      }
    }
    effects.set(declaration, out);
    return out;
  };
  return {
    language: "typescript",
    evidence: { pairsCalls: true, deadEnds: true },
    file(file) {
      const { relative, absolute } = sourceFileFor(tier1, file);
      return { relative, absolute };
    },
    candidates(file, span, text) {
      const found = sourceFileFor(tier1, file).sourceFile;
      return candidatesAt(ts, found, span, text).map(({ kind, text: candidateText, span: candidateSpan }) => ({ kind, text: candidateText, span: candidateSpan }));
    },
    // The TypeScript ledger walks the Program's own nodes for its parts (`value-flow.ts` `compose`).
    parts() {
      return [];
    },
    identifierOnLine(file, name, line) {
      const found = sourceFile(file);
      return found ? identifierOnLine(ts, found, name, line) : null;
    },
    textAt(file, span) {
      const at = nodeAt(file, span);
      return at ? at.node.getText(at.sourceFile) : null;
    },
    unsureBinding(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      // The element may sit on the name or on its whole declaration.
      const node = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      // An argument at or after a spread (`f(...pair, x)`) is not at the position the binding names; the evidence may sit inside `x as T`.
      let argument: TypeScript.Node = at.node;
      while (ts.isAsExpression(argument.parent) || ts.isSatisfiesExpression(argument.parent) || ts.isParenthesizedExpression(argument.parent) || ts.isNonNullExpression(argument.parent) || ts.isTypeAssertionExpression(argument.parent)) argument = argument.parent;
      const call = argument.parent;
      if ((ts.isCallExpression(call) || ts.isNewExpression(call)) && call.arguments) {
        const index = call.arguments.indexOf(argument as TypeScript.Expression);
        if (index >= 0 && call.arguments.slice(0, index + 1).some((argument) => ts.isSpreadElement(argument))) return true;
      }
      // A function that declares `this` binds its arguments one place over.
      if (ts.isParameter(node) && node.parent.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "this")) return true;
      // A state pair's `[value, setter]` is modelled; an object pattern, a rest or a default is not one value the evidence names.
      if (ts.isBindingElement(node)) return ts.isObjectBindingPattern(node.parent) || !!node.initializer || !!node.dotDotDotToken;
      if (ts.isParameter(node)) return !!node.initializer || !!node.dotDotDotToken || !ts.isIdentifier(node.name);
      if (ts.isVariableDeclaration(node)) return ts.isObjectBindingPattern(node.name);
      return false;
    },
    callable(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      if (checker.getTypeAtLocation(at.node).getCallSignatures().length > 0) return true;
      // Untyped, the model still says it: a pair's first handle that is read by calling it (`ReturnValue.Member[0].ReturnValue`).
      const element = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      const pattern = ts.isBindingElement(element) ? element.parent : undefined;
      const declaration = pattern && ts.isArrayBindingPattern(pattern) && pattern.elements[0] === element ? pattern.parent : undefined;
      const cell = declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? cellCall(ts, checker, declaration.initializer) : null;
      return !!cell && (cell.row.reads ?? []).some((path) => path === "ReturnValue.Member[0].ReturnValue");
    },
    returnUnsure(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      let node: TypeScript.Node | undefined = at.node;
      while (node && !ts.isFunctionLike(node)) {
        if (ts.isYieldExpression(node)) return true;
        node = node.parent;
      }
      if (!node) return false;
      const fn = node as TypeScript.SignatureDeclaration & { body?: TypeScript.Node; asteriskToken?: TypeScript.AsteriskToken };
      // A generator's value is an iterator, not what it returns; a block body whose end can be reached also returns undefined.
      if (fn.asteriskToken) return true;
      if (fn.body && ts.isBlock(fn.body) && !endsAlways(fn.body)) return true;
      // A method (of a class or an object, or a function-valued property) runs on whatever receiver the call has: another object's method of the same name may run.
      if (ts.isMethodDeclaration(fn) || ts.isPropertyAssignment(fn.parent) || ts.isPropertyDeclaration(fn.parent)) return "method";
      // An async function's call is a promise: what it returns is the field only once awaited.
      if (ts.getCombinedModifierFlags(fn as unknown as TypeScript.Declaration) & ts.ModifierFlags.Async) return "async";
      // A function handed to a call (`.then(cb)`, `.map(cb)`, `useState(cb)`) returns to whatever that call does with it.
      return ts.isCallExpression(fn.parent) && fn.parent.arguments.includes(fn as unknown as TypeScript.Expression) ? "callback" : false;
    },
    mayObject(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      const type = checker.getTypeAtLocation(at.node);
      const object = (member: TypeScript.Type) => (member.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive | ts.TypeFlags.TypeParameter)) !== 0 || (!!(member.flags & ts.TypeFlags.Object) && member.getCallSignatures().length === 0);
      return (type.isUnion() ? type.types : [type]).some(object);
    },
    ownReturns(file, span) {
      const at = nodeAt(file, span);
      if (!at) return null;
      const fn = at.node;
      if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
      if (fn.asteriskToken || ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) return null;
      if (!ts.isBlock(fn.body)) return [spanOf(at.sourceFile, fn.body)];
      if (!endsAlways(fn.body)) return null;
      const out: Span[] = [];
      let bare = false;
      const visit = (node: TypeScript.Node) => {
        if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
        if (ts.isReturnStatement(node)) {
          if (node.expression) out.push(spanOf(at.sourceFile, node.expression));
          else bare = true;
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(fn.body, visit);
      return bare || !out.length ? null : out;
    },
    optionalCall(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      // `a?.b()`, `a?.()`: the call does not run when the chain short-circuits.
      for (let node: TypeScript.Node = at.node; ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isNonNullExpression(node); node = (node as TypeScript.CallExpression).expression) {
        if ((node as TypeScript.CallExpression).questionDotToken) return true;
      }
      return false;
    },
    calleeReplaced(file, span) {
      const at = nodeAt(file, span);
      if (!at || !ts.isCallExpression(at.node)) return false;
      // The callee's root binding (`f`, `service` in `service.load()`): a reassigned `let`, or an object whose property is written, may run another body.
      let root: TypeScript.Node = at.node.expression;
      while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isNonNullExpression(root) || ts.isParenthesizedExpression(root)) root = root.expression;
      if (!ts.isIdentifier(root)) return false;
      const declaration = checker.getSymbolAtLocation(root)?.valueDeclaration;
      return !!declaration && (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && changedBinding(declaration);
    },
    hasArguments(file, span) {
      const at = nodeAt(file, span);
      return !!at && ts.isCallExpression(at.node) && at.node.arguments.length > 0;
    },
    awaited(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      let node: TypeScript.Node = at.node;
      while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isNonNullExpression(node.parent)) node = node.parent;
      return ts.isAwaitExpression(node.parent);
    },
    mutable(file, span) {
      const at = nodeAt(file, span);
      if (!at || !ts.isObjectLiteralExpression(at.node)) return false;
      // Up through the object literals (and `as`/`satisfies`) that hold it, to the binding that names the outermost one.
      let holder: TypeScript.Node = at.node;
      for (;;) {
        if (ts.isPropertyAssignment(holder.parent) && ts.isObjectLiteralExpression(holder.parent.parent)) holder = holder.parent.parent;
        else if (ts.isAsExpression(holder.parent) || ts.isSatisfiesExpression(holder.parent) || ts.isParenthesizedExpression(holder.parent)) holder = holder.parent;
        else break;
      }
      const parent = holder.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer === holder) return changedBinding(parent);
      // Assigned after its declaration (`o = { … }`): the binding it lands in, checked the same way.
      if (ts.isBinaryExpression(parent) && parent.right === holder && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(parent.left)) {
        const declaration = checker.getSymbolAtLocation(parent.left)?.valueDeclaration;
        return !!declaration && (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && changedBinding(declaration, parent.left);
      }
      return false;
    },
    mayCall(file, span) {
      const at = nodeAt(file, span);
      if (!at) return true;
      const type = checker.getTypeAtLocation(at.node);
      // A broad type can hold a function with no call signature of its own: `Function`, `Object`, `{}`, `object`.
      const broad = (member: TypeScript.Type) => (member.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive)) !== 0 || ["Function", "Object"].includes(member.symbol?.name ?? "") || (!!(member.flags & ts.TypeFlags.Object) && member.getProperties().length === 0);
      return (type.isUnion() ? type.types : [type]).some((member) => member.getCallSignatures().length > 0 || broad(member));
    },
    combinedWrite(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      let node: TypeScript.Node = at.node;
      while (ts.isParenthesizedExpression(node.parent) || ts.isAsExpression(node.parent) || ts.isSatisfiesExpression(node.parent) || ts.isNonNullExpression(node.parent) || ts.isTypeAssertionExpression(node.parent) || ts.isAwaitExpression(node.parent)) node = node.parent;
      const up = node.parent;
      if (!ts.isBinaryExpression(up) || up.right !== node) return false;
      const kind = up.operatorToken.kind;
      const combines = kind > ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
      // `a ||= b`, `a &&= b`, `a ??= b` store b itself when they store anything: b is a value of the field, not an operand.
      return combines && ![ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken].includes(kind);
    },
    mutatedBinding(file, span) {
      const at = nodeAt(file, span);
      if (!at) return false;
      const declaration = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      return (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && changedBinding(declaration);
    },
    stateEffects(file, span) {
      const at = nodeAt(file, span);
      if (!at) return null;
      // The state element sits at the pair's value binding: `doc` of `const [doc, setDoc] = …`.
      const element = ts.isIdentifier(at.node) ? at.node.parent : at.node;
      const pattern = ts.isBindingElement(element) ? element.parent : null;
      if (!pattern || !ts.isArrayBindingPattern(pattern) || pattern.elements[0] !== element || !ts.isVariableDeclaration(pattern.parent)) return null;
      return pairEffects(pattern.parent);
    },
    stateFactory(file, span) {
      const at = nodeAt(file, span);
      return !!at && ts.isCallExpression(at.node) && cellCall(ts, checker, at.node) !== null;
    },
    objectMembers(file, span) {
      const at = nodeAt(file, span);
      if (!at || !ts.isObjectLiteralExpression(at.node)) return null;
      return at.node.properties.map((member) => {
        if (ts.isSpreadAssignment(member) || !member.name || ts.isComputedPropertyName(member.name)) return null;
        return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) || ts.isNumericLiteral(member.name) || ts.isPrivateIdentifier(member.name) ? member.name.text : null;
      });
    },
    typeTextAt(file, span) {
      const at = nodeAt(file, span);
      if (!at) return null;
      if (typeTexts.has(at.node)) return typeTexts.get(at.node)!;
      try {
        const text = checker.typeToString(checker.getTypeAtLocation(at.node));
        const clipped = text.length > 160 ? `${sliceWhole(text, 159)}…` : text;
        typeTexts.set(at.node, clipped);
        return clipped;
      } catch {
        typeTexts.set(at.node, null);
        return null;
      }
    },
    linksOf(file, span) {
      const at = nodeAt(file, span);
      return at && ts.isFunctionLike(at.node) ? linksOf(ts, checker, root, at.node) : { calls: [], reads: [], writes: [] };
    },
    bindingAt(file, span) {
      const at = nodeAt(file, span);
      return at ? bindingOf(ts, checker, root, at.node) : null;
    },
    scopeAt(file, span) {
      const at = nodeAt(file, span);
      const fn = at ? enclosingFunction(ts, at.node) : null;
      if (!fn || !at) return null;
      let scope = scopes.get(fn);
      if (!scope) {
        scope = { span: spanOf(at.sourceFile, fn), name: functionName(ts, fn, at.sourceFile), role: scopeRole(ts, checker, fn, at.sourceFile) };
        scopes.set(fn, scope);
      }
      return scope;
    },
    callSitesOf(element) {
      sites ??= createCallSiteIndex(tier1);
      return callSitesOfElement(tier1, sites, element);
    },
  };
}

/**
 * The identifier `name` on `line`: a declaration's name first, else the first
 * use. The engine's evidence for a declaration sits on its initializer (a
 * `createResource(...)` call) or on the whole function, not on the name, so
 * those nodes follow as fallbacks.
 */
function identifierOnLine(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, name: string, line: number): HostCandidate | null {
  const hits: TypeScript.Identifier[] = [];
  const visit = (node: TypeScript.Node) => {
    if (ts.isIdentifier(node) && node.text === name && sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 === line) hits.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const declares = (id: TypeScript.Identifier) => {
    const p = id.parent;
    return (
      (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isClassDeclaration(p) || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) &&
      p.name === id
    );
  };
  const node = hits.find(declares) ?? hits[0];
  if (!node) return null;
  const fallbacks: TypeScript.Node[] = [];
  const p = node.parent;
  // `const [records] = createResource(…)`: the name is a binding element; the evidence is on the initializer.
  let declaration: TypeScript.Node | undefined = p;
  while (declaration && !ts.isVariableDeclaration(declaration) && (ts.isBindingElement(declaration) || ts.isArrayBindingPattern(declaration) || ts.isObjectBindingPattern(declaration))) declaration = declaration.parent;
  if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) fallbacks.push(declaration.initializer);
  if (declares(node)) fallbacks.push(p);
  // `<RouteFrame …>`: a JSX tag's evidence is the occurrence, the element itself.
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === node) {
    fallbacks.push(p);
    if (ts.isJsxOpeningElement(p) && ts.isJsxElement(p.parent)) fallbacks.push(p.parent);
  }
  if (declaration && ts.isVariableDeclaration(declaration)) {
    fallbacks.push(declaration);
    if (ts.isVariableDeclarationList(declaration.parent) && ts.isVariableStatement(declaration.parent.parent)) fallbacks.push(declaration.parent.parent);
  }
  return { kind: ts.SyntaxKind[node.kind], text: name, span: spanOf(sourceFile, node), fallbacks: fallbacks.map((item) => spanOf(sourceFile, item)) };
}

/**
 * The local binding under an expression: down through field reads, `!`, parentheses and argument-free
 * calls of the binding itself (a Solid accessor) to an identifier declared as a variable, parameter or
 * destructured name in a source file of the root. A method call (`x.trim()`) is a new value, not a read.
 */
function bindingOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, found: TypeScript.Node) {
  // A lone attribute has the span of the attribute list around it.
  const node = ts.isJsxAttributes(found) && found.properties.length === 1 ? found.properties[0] : found;
  const fields: string[] = [];
  // `note={n()}`: a prop binding reads its expression, and fills the attribute it names.
  const filled = ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
  let at: TypeScript.Node = filled ?? (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node) ? node.name : node);
  // `const [doc, setDoc] = …`: a pattern stands for its first name, the value it reads.
  while (ts.isArrayBindingPattern(at) || ts.isObjectBindingPattern(at)) {
    const elements: readonly TypeScript.Node[] = at.elements;
    const first = elements.find((item): item is TypeScript.BindingElement => ts.isBindingElement(item));
    if (!first) return null;
    at = first.name;
  }
  for (;;) {
    if (ts.isParenthesizedExpression(at) || ts.isNonNullExpression(at)) at = at.expression;
    else if (ts.isPropertyAccessExpression(at)) {
      fields.unshift(at.name.text);
      at = at.expression;
    } else if (ts.isCallExpression(at) && at.arguments.length === 0 && ts.isIdentifier(skipWrappers(ts, at.expression))) at = skipWrappers(ts, at.expression);
    else break;
  }
  if (!ts.isIdentifier(at)) return null;
  let symbol: TypeScript.Symbol | undefined;
  try {
    symbol = ts.isShorthandPropertyAssignment(at.parent) && at.parent.name === at ? checker.getShorthandAssignmentValueSymbol(at.parent) : checker.getSymbolAtLocation(at);
  } catch {
    return null;
  }
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (!symbol || !declaration || declaration.getSourceFile().isDeclarationFile) return null;
  if (!(ts.isVariableDeclaration(declaration) || ts.isParameter(declaration) || ts.isBindingElement(declaration))) return null;
  const id = compilerSymbolId(ts, checker, root, at, symbol);
  if (!id) return null;
  const parent = filled ? node : node.parent && ts.isJsxExpression(node.parent) ? node.parent.parent : node.parent;
  const attribute = parent && ts.isJsxAttribute(parent) ? parent.name.getText() : null;
  return { symbol: id, field: fields.length ? fields.join(".") : null, attribute, state: stateOf(ts, checker, declaration) };
}

/** `const [doc] = createResource(…)`: the state the declaration's initializer makes, else null. */
function stateOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, declaration: TypeScript.Declaration): BindingState | null {
  let at: TypeScript.Node = declaration;
  while (ts.isBindingElement(at) || ts.isArrayBindingPattern(at) || ts.isObjectBindingPattern(at)) at = at.parent;
  if (!ts.isVariableDeclaration(at) || !at.initializer) return null;
  const init = skipWrappers(ts, at.initializer);
  if (!ts.isCallExpression(init)) return null;
  const callee = skipWrappers(ts, init.expression);
  // The callee's row names the state it makes (`state`).
  try {
    return builtinTsModel(ts, checker, callee)?.state ?? null;
  } catch {
    return null;
  }
}

function skipWrappers(ts: typeof TypeScript, node: TypeScript.Expression): TypeScript.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}

/** A function's calls into the root and the outer bindings it reads and writes; nested functions are their own. */
function linksOf(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, fn: TypeScript.SignatureDeclaration) {
  const calls = new Map<string, { file: string; span: Span }>();
  const reads = new Set<string>();
  const writes = new Set<string>();
  const outer = (id: TypeScript.Identifier): { symbol: TypeScript.Symbol; declaration: TypeScript.Declaration } | null => {
    let symbol: TypeScript.Symbol | undefined;
    try {
      symbol = checker.getSymbolAtLocation(id);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    } catch {
      return null;
    }
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!symbol || !declaration || declaration.getSourceFile().isDeclarationFile) return null;
    // Declared inside this function: its own, not something it reaches out to.
    if (declaration.pos >= fn.pos && declaration.end <= fn.end && declaration.getSourceFile() === fn.getSourceFile()) return null;
    return { symbol, declaration };
  };
  const idOf = (node: TypeScript.Identifier, symbol: TypeScript.Symbol) => compilerSymbolId(ts, checker, root, node, symbol);
  const visit = (node: TypeScript.Node) => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = skipWrappers(ts, node.expression);
      const name = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? callee.name : null;
      const target = name ? outer(name) : null;
      const decl = target?.declaration;
      const body = decl && (ts.isFunctionLike(decl) ? decl : ts.isVariableDeclaration(decl) && decl.initializer && ts.isFunctionLike(skipWrappers(ts, decl.initializer)) ? skipWrappers(ts, decl.initializer) : null);
      if (body && path.resolve(body.getSourceFile().fileName).startsWith(root)) {
        const sf = body.getSourceFile();
        const file = path.relative(root, sf.fileName).split(path.sep).join("/");
        const span = spanOf(sf, body);
        calls.set(`${file}:${span.startLine}:${span.startColumn}`, { file, span });
      }
      // `setDoc(…)`: a state setter writes the value its pair reads.
      if (target && ts.isIdentifier(callee) && ts.isBindingElement(target.declaration) && ts.isArrayBindingPattern(target.declaration.parent)) {
        const pair = target.declaration.parent.elements;
        const first = pair[0];
        if (pair.indexOf(target.declaration) === 1 && first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) {
          const read = checker.getSymbolAtLocation(first.name);
          const id = read ? idOf(first.name, read) : null;
          if (id) writes.add(id);
        }
      }
    }
    if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
      const found = outer(node);
      const d = found?.declaration;
      if (found && d && (ts.isVariableDeclaration(d) || ts.isBindingElement(d) || ts.isParameter(d))) {
        const id = idOf(node, found.symbol);
        const assigned = ts.isBinaryExpression(node.parent) && node.parent.left === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        if (id) (assigned ? writes : reads).add(id);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return { calls: [...calls.values()], reads: [...reads], writes: [...writes] };
}
