import * as TypeScript from "typescript";
import type { ProgramElementKind } from "./program-evidence";
import type { CollectorCallInfo, CollectorFunctionInfo } from "./program-evidence-collector-support";
import type { PendingComponentPropBinding } from "./program-evidence-collector-component-binding";
import { ProgramEvidenceCollectorFieldTransferSupport } from "./program-evidence-collector-field-transfers";
import { reachingBindings } from "./program-evidence-reaching-bindings";
import { resolveValue, wrapperFillsParameters } from "./value-origin";
import { stateFactory, stateRoleOf } from "./program-evidence-state-pairs";
import { watchedFunction } from "./framework-flows";
import { isImmerDraft, storeApiCall, storeCreators, storeMember } from "./zustand-store";
import type { ProgramEvidenceLocation } from "./program-evidence";
import { isSolidComponent } from "./program-evidence-collector-field-transfer-ast";
import { ContextAncestry, contextApplies } from "./program-evidence-context-ancestry";
import { programEvidenceCandidateIndex } from "./program-evidence-candidate-index";
import {
  asFunctionLike,
  browserMember,
  browserPropertyRead,
  compilerSymbolId,
  derivedOperands,
  importedCallee,
  isAssignmentOperator,
  firstBindingIdentifier,
  isBoundHandlerPair,
  functionNameNode,
  isExitStatusAssignment,
  isSelectionOperator,
  jsxOpeningAncestor,
  nodeKey,
  proof,
  unwrap,
} from "./program-evidence-support";

export class ProgramEvidenceCollectorJsxSupport extends ProgramEvidenceCollectorFieldTransferSupport {
  /** Each context's provided values, by the `createContext()` call the context is. */
  private readonly contextProviders = new Map<string, string[]>();
  /** Each store hook (`const useStore = create(fn)`) by its symbol: its state element and the function that makes the store. */
  private readonly stores = new Map<TypeScript.Symbol, string>();
  /** Each context's provided values as written (`value={{ save }}`), to find the function a context method names. */
  private readonly contextValues = new Map<string, TypeScript.Expression[]>();
  /** Each context's `createContext()` call, by its key: its argument is the default. */
  private readonly contextCalls = new Map<string, TypeScript.CallExpression>();
  private readonly contextAncestry = new ContextAncestry({
    ts: this.ts,
    provided: (tag) => this.providedContext(tag),
    component: (tag) => this.renderedComponent(tag).target?.declaration ?? null,
    references: (name) => programEvidenceCandidateIndex(this.ts, this.program, this.root).referencesFor(name),
  });

  protected collectNodes(root: TypeScript.Node): void {
    const visit = (node: TypeScript.Node, ownerId: string | null) => {
      this.noteAstUnit();
      const info = asFunctionLike(this.ts, node) ? this.functionsByNode.get(nodeKey(this.root, node)) : undefined;
      const nextOwner = info?.id ?? ownerId;
      if (this.ts.isVariableDeclaration(node) && node.initializer) {
        this.processVariable(node, nextOwner);
      }
      if (this.ts.isCallExpression(node)) {
        this.processCall(node, nextOwner);
      }
      if (this.ts.isNewExpression(node)) {
        this.processNew(node, nextOwner);
      }
      if (this.ts.isPropertyAccessExpression(node)) {
        this.processProperty(node, nextOwner);
      }
      if (this.ts.isElementAccessExpression(node)) {
        this.processIndex(node, nextOwner);
      }
      // `f.apply(t, [a, b])`'s list is no value of its own: each item is an argument (`callAdapter`).
      const applyList = this.ts.isArrayLiteralExpression(node) && this.ts.isCallExpression(node.parent) && this.callAdapter(node.parent)?.list === node;
      if ((this.ts.isObjectLiteralExpression(node) || this.ts.isArrayLiteralExpression(node)) && !applyList) {
        this.processObject(node, nextOwner);
      }
      if (this.ts.isForOfStatement(node)) {
        this.processForOf(node, nextOwner);
      }
      if (this.ts.isConditionalExpression(node)) {
        this.processSelection(node, nextOwner);
      }
      if (
        this.ts.isBinaryExpression(node) &&
        isSelectionOperator(this.ts, node.operatorToken.kind)
      ) {
        this.processSelection(node, nextOwner);
      }
      const operands = derivedOperands(this.ts, node);
      if (operands) {
        this.processDerived(node as TypeScript.Expression, operands, nextOwner);
      }
      if (
        this.ts.isBinaryExpression(node) &&
        isExitStatusAssignment(this.ts, node, this.globalMembers.exit)
      ) {
        this.processExitStatusAssignment(node, nextOwner);
      }
      if (this.ts.isBinaryExpression(node) && isAssignmentOperator(this.ts, node.operatorToken.kind) && this.ts.isIdentifier(node.left)) {
        this.processAssignment(node as TypeScript.BinaryExpression & { left: TypeScript.Identifier }, nextOwner);
      }
      // `obj.field = value`, and a compound one (`count.current += step`, `cache.hit ??= value`): the right side goes into the field.
      // `obj["field"] = value` and `obj[key] = value` too, on a local object.
      if (this.ts.isBinaryExpression(node) && isAssignmentOperator(this.ts, node.operatorToken.kind) && (this.ts.isPropertyAccessExpression(node.left) || this.ts.isElementAccessExpression(node.left))) {
        this.processFieldAssignment(node as TypeScript.BinaryExpression & { left: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression }, nextOwner);
      }
      if (this.ts.isPropertyAccessExpression(node) && !(this.ts.isBinaryExpression(node.parent) && node.parent.left === node && isAssignmentOperator(this.ts, node.parent.operatorToken.kind))) {
        this.memberReads.push({ node, ownerId: nextOwner });
        if (browserPropertyRead(browserMember(this.ts, this.checker, node))) this.processBrowserRead(node, nextOwner);
      }
      if (this.ts.isReturnStatement(node)) {
        this.processReturn(node, nextOwner);
      }
      // A thrown value is a value the code uses: it ends at the `throw` (`endsInPlace`).
      if (this.ts.isThrowStatement(node) && node.expression) {
        this.expression(node.expression, nextOwner);
      }
      // A generator's `yield x` hands x to its caller's iteration (`for (const v of gen())`), as a return hands it to the call.
      // `yield* list` hands on each element of `list`: the call's value is iterated as `list` is.
      if (this.ts.isYieldExpression(node) && node.expression) {
        this.processReturn(node.expression, nextOwner);
      }
      if (this.ts.isArrowFunction(node) && !this.ts.isBlock(node.body)) {
        this.processReturn(node.body, nextOwner);
      }
      if (this.ts.isJsxElement(node) || this.ts.isJsxSelfClosingElement(node)) {
        this.measurePhase("renderComponents", 1, () => this.processJsx(node, nextOwner));
      }
      if (this.ts.isJsxExpression(node) && node.expression) {
        this.measurePhase("renderComponents", 1, () => this.processJsxExpression(node, nextOwner));
      }
      this.ts.forEachChild(node, (child) => visit(child, nextOwner));
    };
    visit(root, null);
  }

  protected processJsx(
    node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
    ownerId: string | null,
  ): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(node.getSourceFile());
    const { provided, dynamic, targets, aliasId } = this.occurrenceTargets(opening);
    // One component the tag renders is its definition; a tag that renders one of several (`<Dynamic component={kinds[kind]}>`) names none.
    const target = targets.length === 1 ? targets[0] : null;
    const component = Boolean(targets.length || aliasId);
    const kind: ProgramElementKind = component
      ? "component-occurrence"
      : "jsx-occurrence";
    const occurrenceId = this.ensureElement(
      opening,
      kind,
      ownerId,
      { tag, intrinsic: !component },
      this.symbolId(opening.tagName),
      this.moduleFor(opening.tagName),
      target?.id ?? null,
      component ? "proven" : "partial",
      proof(
        component ? "compiler-symbol" : "jsx-tag",
        target
          ? "The JSX tag resolves to an in-project component definition."
          : targets.length
            ? "The JSX tag renders one of several in-project component definitions."
            : aliasId
            ? "The JSX tag names a component value the program declares."
            : "The JSX tag is a source-backed render occurrence.",
        [this.location(opening)],
      ),
    );
    if (ownerId) {
      this.addRelation(
        ownerId,
        occurrenceId,
        "renders",
        [this.location(opening)],
        proof(
          "jsx-tag",
          "The containing function owns this JSX occurrence.",
          [this.location(opening)],
        ),
        "proven",
      );
    }
    // A tag that names a value the program declares (`const Badge = styled(…)`) renders that value here.
    if (aliasId) {
      this.addRelation(aliasId, occurrenceId, "references", [this.location(opening.tagName)], proof("compiler-symbol", "The JSX tag names this value and renders it here.", [this.location(opening.tagName)]), "proven");
    }
    // One function written as the element's child (`<Mouse>{(x) => …}</Mouse>`) is its `children` prop.
    const element = opening.parent;
    const written = this.ts.isJsxElement(element) ? element.children.filter((child) => !this.ts.isJsxText(child) || child.text.trim() !== "") : [];
    const child = written.length === 1 && this.ts.isJsxExpression(written[0]) && written[0].expression ? unwrap(this.ts, written[0].expression) : undefined;
    if (child && (this.ts.isArrowFunction(child) || this.ts.isFunctionExpression(child))) for (const each of targets) this.childFunctions.push({ target: each.id, value: child });
    for (const each of targets) {
      this.addRelation(
        occurrenceId,
        each.id,
        "component-occurrence",
        [this.location(opening.tagName)],
        proof(
          "compiler-symbol",
          "The JSX tag resolves to the component definition.",
          [this.location(opening.tagName)],
        ),
        "proven",
      );
    }
    for (const attribute of opening.attributes.properties) {
      this.checkCancellation();
      if (dynamic && this.ts.isJsxAttribute(attribute) && attribute.name.getText() === "component") continue;
      // A spread hands every field of its value to the occurrence: a component's props, or the element's attributes.
      if (this.ts.isJsxSpreadAttribute(attribute)) {
        const spreadId = this.expression(attribute.expression, ownerId);
        this.addRelation(
          spreadId,
          occurrenceId,
          component ? "component-prop" : "render-terminal",
          [this.location(attribute)],
          proof("jsx-tag", component ? "The JSX spread passes its fields as component props." : "The JSX spread reaches an intrinsic render occurrence.", [this.location(attribute)]),
          component ? "proven" : "partial",
        );
        if (!component) this.addTerminal(attribute.expression, ownerId, "dom-attribute", "...", spreadId);
        for (const each of targets) this.bindSpreadProps(attribute, spreadId, each);
        continue;
      }
      if (!this.ts.isJsxAttribute(attribute)) continue;
      // A component's `label="toc"` is a prop value as much as `label={"toc"}`;
      // on an intrinsic element it is markup, with nothing upstream to trace.
      const value = attribute.initializer && this.ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : component ? attribute.initializer : undefined;
      if (!value || !this.ts.isExpression(value)) continue;
      // Solid's bound handler (`onClick={[remove, id]}`): the page calls `remove(id, event)`; the pair is no DOM attribute.
      if (!component && this.bindsEventData(value, ownerId)) continue;
      const valueId = this.expression(value, ownerId);
      const context = attribute.name.getText() === "value" ? provided : null;
      if (context) {
        this.contextProviders.set(context, [...(this.contextProviders.get(context) ?? []), valueId]);
        this.contextValues.set(context, [...(this.contextValues.get(context) ?? []), value]);
      }
      this.addRelation(
        valueId,
        occurrenceId,
        component ? "component-prop" : "render-terminal",
        [this.location(attribute)],
        proof(
          "jsx-tag",
          component
            ? "The JSX attribute binds a component prop."
            : "The JSX attribute reaches an intrinsic render occurrence.",
          [this.location(attribute)],
        ),
        component ? "proven" : "partial",
      );
      for (const each of targets) this.queueComponentPropBinding(opening, attribute, valueId, occurrenceId, ownerId, each);
      // A context's provided value goes to its readers (`connectContexts`), not into the page.
      // Solid's `<For each>` and `<Index each>` hand their items to the render callback (`connectSolidFor`); the list is no DOM attribute.
      const listed = attribute.name.getText() === "each"
        && (isSolidComponent(this.ts, this.checker, opening.tagName, "For") || isSolidComponent(this.ts, this.checker, opening.tagName, "Index"));
      if (!component && !context && !listed) {
        // Solid's `<Show when>` and `<Match when>` decide which branch renders; the value is no DOM attribute.
        const branch = attribute.name.getText() === "when"
          && (isSolidComponent(this.ts, this.checker, opening.tagName, "Show") || isSolidComponent(this.ts, this.checker, opening.tagName, "Match"));
        this.addTerminal(
          value,
          ownerId,
          branch ? "branch-condition" : "dom-attribute",
          attribute.name.getText(),
          valueId,
        );
      }
    }
  }

  /**
   * A spread into an in-project component (`<Card {...props} />`) hands its
   * value to the component's props parameter: the whole object, or each name
   * a destructured parameter takes from it.
   */
  private bindSpreadProps(attribute: TypeScript.JsxSpreadAttribute, spreadId: string, target: CollectorFunctionInfo): void {
    if (target.declaration.parameters.length < 1) return;
    const parameter = target.declaration.parameters[0];
    const names = this.ts.isIdentifier(parameter.name)
      ? [parameter.name]
      : this.ts.isObjectBindingPattern(parameter.name)
        ? parameter.name.elements.flatMap((element) => (this.ts.isIdentifier(element.name) ? [element.name] : []))
        : [];
    for (const name of names) {
      const parameterId = this.parametersBySymbol.get(this.symbolId(name) ?? "");
      if (!parameterId) continue;
      this.addRelation(
        spreadId,
        parameterId,
        "component-prop-binding",
        [this.location(attribute), this.location(name)],
        proof("component-prop-binding", "The JSX spread passes its fields to the component's props parameter.", [this.location(attribute), this.location(name)]),
        "proven",
      );
    }
  }

  /** The `component` a Solid `<Dynamic>` renders, when the tag is `solid-js/web`'s `Dynamic`. */
  private dynamicComponent(opening: TypeScript.JsxOpeningLikeElement): TypeScript.Expression | undefined {
    if (!this.ts.isIdentifier(opening.tagName)) return undefined;
    const imported = importedCallee(this.ts, this.checker, opening.tagName);
    if (imported?.module !== "solid-js/web" || imported.name !== "Dynamic") return undefined;
    const attribute = opening.attributes.properties.find((item): item is TypeScript.JsxAttribute => this.ts.isJsxAttribute(item) && item.name.getText() === "component");
    const value = attribute?.initializer && this.ts.isJsxExpression(attribute.initializer) ? attribute.initializer.expression : undefined;
    return value ?? undefined;
  }

  /**
   * What a JSX tag renders. A tag that names an in-project function renders
   * that component. A tag that names a value the program declares renders
   * that value (`aliasId`): a component made by a factory (`styled(…)`) or
   * taken from a library (`Primitive.Root`); when the value is exactly an
   * in-project component under another name (`const Root = Card`), the tag
   * renders that component too. The compiler checks every tag's value as a
   * component, so the tag's own symbol is the whole proof.
   */
  protected renderedComponent(tagName: TypeScript.JsxTagNameExpression): { target: CollectorFunctionInfo | null; targets: CollectorFunctionInfo[]; aliasId: string | null } {
    const named = this.functionsBySymbol.get(this.symbolId(tagName) ?? "");
    // `lazy(() => import("./chart"))` names its loader, which is no component: the module's default export is.
    if (named && !loadsModule(this.ts, named.declaration)) return { target: named, targets: [named], aliasId: null };
    const targets = this.ts.isJsxNamespacedName(tagName) ? [] : this.componentsOf(tagName);
    return { target: targets.length === 1 ? targets[0] : null, targets, aliasId: this.variablesBySymbol.get(this.symbolId(tagName) ?? "") ?? null };
  }

  protected override openingRenders(opening: TypeScript.JsxOpeningLikeElement): { targets: CollectorFunctionInfo[]; intrinsic: boolean } {
    const { provided, targets, aliasId } = this.occurrenceTargets(opening);
    return { targets, intrinsic: !provided && !targets.length && !aliasId };
  }

  /** What a JSX opening renders: a provided context, or the in-project components (with `<Dynamic>`'s `component` expression). */
  protected occurrenceTargets(opening: TypeScript.JsxOpeningLikeElement): { provided: string | null; dynamic: TypeScript.Expression | undefined; targets: CollectorFunctionInfo[]; aliasId: string | null } {
    // A provider (`<Ctx.Provider>`, React 19's `<Ctx>`) hands its value to the context's readers, not to a component.
    const provided = this.providedContext(opening.tagName);
    if (provided) return { provided, dynamic: undefined, targets: [], aliasId: null };
    const rendered = this.renderedComponent(opening.tagName);
    // `<Dynamic component={Card} title={…} />` renders `Card`, and hands it the other attributes.
    const dynamic = rendered.targets.length ? undefined : this.dynamicComponent(opening);
    return dynamic ? { provided, dynamic, targets: this.componentsOf(dynamic), aliasId: null } : { provided, dynamic, ...rendered };
  }

  /**
   * The in-project components a value is, by what the checker proves of it:
   * the one function it names (`targetFunction`); each component a key of
   * the key's literal type picks from an object (`kinds[props.kind]`); the
   * default export of the module a loader imports (`lazy(() => import(m))`);
   * the function an in-project factory returns (`withTitle(Heading)`); and,
   * for a parameter of an in-project function, what every call passes in
   * its place. Empty unless every case resolves.
   */
  protected componentsOf(expression: TypeScript.Expression, depth = 0): CollectorFunctionInfo[] {
    if (depth > 4) return [];
    const one = this.targetFunction(expression);
    if (one && !loadsModule(this.ts, one.declaration)) return [one];
    const unwrapped = unwrap(this.ts, expression);
    const origin = this.ts.isElementAccessExpression(unwrapped) || this.ts.isCallExpression(unwrapped) ? unwrapped : resolveValue(this.ts, this.checker, unwrapped)?.origin;
    if (!origin) return [];
    const all = (items: readonly TypeScript.Expression[]) => {
      const found = items.map((item) => this.componentsOf(item, depth + 1));
      return found.length && found.every((list) => list.length) ? [...new Set(found.flat())] : [];
    };
    if (this.ts.isElementAccessExpression(origin)) {
      const key = this.checker.getTypeAtLocation(origin.argumentExpression);
      const keys = key.isUnion() ? key.types : [key];
      if (!keys.every((item) => item.isStringLiteral())) return [];
      const object = this.checker.getTypeAtLocation(origin.expression);
      const values = keys.map((item) => {
        const declaration = this.checker.getPropertyOfType(object, (item as TypeScript.StringLiteralType).value)?.valueDeclaration;
        if (declaration && this.ts.isPropertyAssignment(declaration)) return declaration.initializer;
        if (declaration && this.ts.isShorthandPropertyAssignment(declaration)) return declaration.name;
        return null;
      });
      return values.every((value): value is TypeScript.Expression => value !== null) ? all(values) : [];
    }
    if (this.ts.isCallExpression(origin)) {
      const loaded = origin.arguments.map((argument) => importedModule(this.ts, unwrap(this.ts, argument))).find((item) => item);
      if (loaded) return this.defaultExportComponents(loaded, depth);
      const factory = this.targetFunction(origin.expression);
      return factory ? all(returnedExpressions(this.ts, factory.declaration)) : [];
    }
    if (this.ts.isParameter(origin) && this.ts.isIdentifier(origin.name)) return all(this.argumentsFor(origin) ?? []);
    return [];
  }

  /** The components a module's default export is (`export default function Chart`, `export default Chart`). */
  private defaultExportComponents(specifier: TypeScript.Expression, depth: number): CollectorFunctionInfo[] {
    const module = this.checker.getSymbolAtLocation(specifier);
    let symbol = module ? this.checker.tryGetMemberInModuleExports("default", module) : undefined;
    if (symbol && symbol.flags & this.ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    if (!declaration) return [];
    const fn = this.functionsByNode.get(nodeKey(this.root, declaration));
    if (fn) return [fn];
    if (this.ts.isExportAssignment(declaration)) return this.componentsOf(declaration.expression, depth + 1);
    if (this.ts.isVariableDeclaration(declaration) && declaration.initializer) return this.componentsOf(declaration.initializer, depth + 1);
    return [];
  }

  /**
   * What every call of an in-project function passes for this parameter, or
   * null when the function is used any other way than called by its name
   * (passed on, stored), so a caller the program cannot see may pass anything.
   */
  private argumentsFor(parameter: TypeScript.ParameterDeclaration): TypeScript.Expression[] | null {
    const fn = parameter.parent;
    if (!this.functionsByNode.get(nodeKey(this.root, fn)) || parameter.dotDotDotToken) return null;
    const index = fn.parameters.indexOf(parameter);
    const name = functionNameNode(this.ts, fn as TypeScript.FunctionLikeDeclaration);
    if (!name) return null;
    const references = programEvidenceCandidateIndex(this.ts, this.program, this.root).referencesFor(name).filter((item) => item !== name);
    const values: TypeScript.Expression[] = [];
    for (const reference of references) {
      const call = reference.parent;
      // An import or export renames the function; the calls through that name are references too.
      if (this.ts.isImportSpecifier(call) || this.ts.isExportSpecifier(call) || this.ts.isImportClause(call) || this.ts.isExportAssignment(call)) continue;
      if (!this.ts.isCallExpression(call) || call.expression !== reference) return null;
      const argument = call.arguments[index];
      if (!argument || call.arguments.some((item) => this.ts.isSpreadElement(item))) return null;
      values.push(argument);
    }
    return values.length ? values : null;
  }

  protected processJsxExpression(
    node: TypeScript.JsxExpression,
    ownerId: string | null,
  ): void {
    if (!node.expression) return;
    if (this.ts.isJsxAttribute(node.parent)) return;
    const valueId = this.expression(node.expression, ownerId);
    const opening = jsxOpeningAncestor(this.ts, node);
    if (!opening) return;
    const { targets, aliasId } = this.renderedComponent(opening.tagName);
    if (targets.length || aliasId) {
      this.addRelation(
        valueId,
        this.elementFor(opening, "component-occurrence"),
        "component-prop",
        [this.location(node)],
        proof(
          "jsx-tag",
          "The JSX child binds a component occurrence.",
          [this.location(node)],
        ),
        "proven",
      );
    } else {
      this.addTerminal(
        node.expression,
        ownerId,
        "jsx-text",
        opening.tagName.getText(node.getSourceFile()),
        valueId,
      );
    }
  }

  protected addTerminal(
    node: TypeScript.Expression,
    ownerId: string | null,
    terminalKind: "jsx-text" | "dom-attribute" | "style" | "branch-condition",
    label: string,
    valueId: string,
  ): void {
    const kind: ProgramElementKind = terminalKind === "jsx-text"
      ? "render-terminal"
      : terminalKind === "branch-condition" ? "branch-condition" : "dom-terminal";
    const terminalId = this.ensureElement(
      node,
      kind,
      ownerId,
      { terminalKind, label },
      null,
      null,
      null,
      "proven",
      proof(
        "jsx-tag",
        "The intrinsic JSX expression is a render terminal.",
        [this.location(node)],
      ),
    );
    this.addRelation(
      valueId,
      terminalId,
      "render-terminal",
      [this.location(node)],
      proof(
        "jsx-tag",
        "The value expression reaches the intrinsic DOM terminal.",
        [this.location(node)],
      ),
      "proven",
    );
  }

  /** The `createContext()` call (Solid's or React's) a context expression is, as a key, or null. */
  private contextKey(expression: TypeScript.Expression, modules = ["solid-js", "react"]): string | null {
    const origin = resolveValue(this.ts, this.checker, expression)?.origin;
    if (!origin || !this.ts.isCallExpression(origin)) return null;
    const imported = importedCallee(this.ts, this.checker, origin.expression);
    const factory = imported?.name === "createContext" && modules.includes(imported.module ?? "");
    if (factory) this.requireReferences(expression);
    if (factory) this.contextCalls.set(nodeKey(this.root, origin), origin);
    return factory ? nodeKey(this.root, origin) : null;
  }

  protected override readsContext(node: TypeScript.CallExpression): boolean {
    const imported = importedCallee(this.ts, this.checker, node.expression);
    if (imported?.name !== "useContext" || (imported.module !== "solid-js" && imported.module !== "react")) return false;
    return Boolean(node.arguments[0] && this.contextKey(node.arguments[0]));
  }

  /** The context a JSX tag provides: `<Ctx.Provider>`, or React 19's `<Ctx>`, which is its own provider. */
  private providedContext(tag: TypeScript.JsxTagNameExpression): string | null {
    if (this.ts.isPropertyAccessExpression(tag) && tag.name.text === "Provider") return this.contextKey(tag.expression);
    if (this.ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) return null;
    return this.ts.isIdentifier(tag) || this.ts.isPropertyAccessExpression(tag) ? this.contextKey(tag, ["react"]) : null;
  }

  /**
   * `useContext(Ctx)` returns what the nearest `Ctx` provider above the reader
   * hands in, or the context's default where none is (`ContextAncestry`).
   * Where a reader's mounts are not known, every provider and the default may be.
   */
  private connectContexts(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const imported = importedCallee(this.ts, this.checker, call.node.expression);
      if (imported?.name !== "useContext" || (imported.module !== "solid-js" && imported.module !== "react")) continue;
      const context = call.node.arguments[0] ? this.contextKey(call.node.arguments[0]) : null;
      if (!context) continue;
      const above = this.contextAncestry.above(call.node, context);
      const values = this.contextValues.get(context) ?? [];
      const at = [this.location(call.node)];
      (this.contextProviders.get(context) ?? []).forEach((valueId, index) => {
        if (!contextApplies(above, values[index])) return;
        this.addRelation(valueId, call.id, "context-value", at, proof("framework-state", "The context's provider supplies the value useContext returns.", at), "proven");
      });
      const fallback = this.contextCalls.get(context)?.arguments[0];
      if (fallback && above.fallback) {
        this.addRelation(this.expression(fallback, this.ownerId(fallback)), call.id, "context-value", at, proof("framework-state", "No provider is above this reader, so useContext returns the context's default.", at), "proven");
      }
    }
  }

  protected connectCalls(): void {
    this.connectContexts();
    this.connectContextPairs();
    this.connectStores();
    this.connectWatchedFunctions();
    const props = new Map<string, PendingComponentPropBinding[]>();
    for (const prop of this.componentPropBindings) {
      const bindings = props.get(prop.target.id) ?? [];
      bindings.push(prop);
      props.set(prop.target.id, bindings);
    }
    this.connectComponentPropBindings();
    this.connectFieldTransfers();
    for (const named of this.calls) {
      this.checkCancellation();
      if (!this.bodyCollected(named.node)) continue;
      // A store member read through its hook (`setCount` after `useStore((s) => s.setCount)`) runs the store's function, never the selector it is written beside.
      const call = named.target && this.storeMethod(named.node.expression).length ? { ...named, target: null } : named;
      const connect = this.shouldConnectCall(call);
      if (call !== named && this.ts.isCallExpression(call.node)) {
        const where = [this.location(call.node.expression)];
        this.addRelation(this.expression(call.node.expression, call.ownerId), call.id, "references", where, proof("ast-node", "The store's function is consumed by this call.", where), "proven");
      }
      if (!call.target && connect) this.connectExternalCall(call);
      if (!call.target) this.connectBoundHandlers(call, props);
      if (!call.target) this.connectEmitter(call);
      if (call.target && connect) {
        const callNode = this.ts.isCallExpression(call.node) ? call.node : null;
        const fillsOwnParameters = wrapperFillsParameters(this.ts, this.checker, call.node.expression);
        for (const parameter of call.target.declaration.parameters) {
          this.checkCancellation();
          const index = call.target.declaration.parameters.indexOf(parameter);
          // `mutate(x, options)`: the options are the hook's own, not the `mutationFn`'s second argument.
          const argument = (index > 0 && callNode && this.mutationFunction(callNode)) || fillsOwnParameters ? undefined : call.adapter ? call.adapter.args[index] : call.node.arguments?.[index];
          const binding = firstBindingIdentifier(this.ts, parameter.name);
          const parameterId = binding
            ? this.parametersBySymbol.get(this.symbolId(binding) ?? "")
            : null;
          if (!argument || !parameterId) continue;
          const argumentId = this.expression(argument, call.ownerId);
          this.addRelation(
            argumentId,
            parameterId,
            "argument-binding",
            [this.location(argument), this.location(parameter)],
            proof(
              "argument-binding",
              "The compiler-resolved call argument binds to the target parameter.",
              [this.location(argument), this.location(parameter)],
            ),
            "proven",
          );
        }
        // A method that reads `this` takes the call's receiver as its receiver, bound like an argument and paired the same way (T13).
        const callee = unwrap(this.ts, call.node.expression);
        // Through an adapter, `this` is the value it was handed (`f.call(t)`), never the function it was read from.
        const adaptedThis = call.adapter?.thisArg && unwrap(this.ts, call.adapter.thisArg);
        const adaptedThisId = adaptedThis && adaptedThis.kind !== this.ts.SyntaxKind.NullKeyword ? this.thisBinding(call.target.declaration) : null;
        if (adaptedThis && adaptedThisId) {
          const at = [this.location(adaptedThis)];
          this.addRelation(this.expression(adaptedThis, call.ownerId), adaptedThisId, "argument-binding", at, proof("argument-binding", "The adapter hands this value to the function as its `this`.", at), "proven");
        }
        const thisId = !call.adapter && (this.ts.isPropertyAccessExpression(callee) || this.ts.isElementAccessExpression(callee)) ? this.thisBinding(call.target.declaration) : null;
        if (thisId && (this.ts.isPropertyAccessExpression(callee) || this.ts.isElementAccessExpression(callee))) {
          const receiverId = this.expression(callee.expression, call.ownerId);
          const at = [this.location(callee.expression)];
          this.addRelation(receiverId, call.id, "argument", at, proof("ast-node", "The receiver is passed to this call as `this`.", at), "proven");
          this.addRelation(receiverId, thisId, "argument-binding", at, proof("argument-binding", "The call's receiver binds to the method's `this`.", at), "proven");
        }
        // `new F(…)` yields the object it made, never what a constructor function returns.
        const yieldsReturn = !this.ts.isNewExpression(call.node) && !(callNode && this.callHasNoValue(callNode));
        for (const returnId of yieldsReturn ? this.returnsByFunction.get(call.target.id) ?? [] : []) {
          this.checkCancellation();
          this.addRelation(
            returnId,
            call.id,
            "return-value",
            [this.location(call.node)],
            proof(
              "return-expression",
              "The call target has a source-backed return expression.",
              [this.location(call.node)],
            ),
            "proven",
          );
        }
      }
    }
    this.connectMemberState();
  }

  /**
   * An emitter's `emit("save", text)` runs each listener its receiver
   * registered for that event (`on`, `once`, `addListener`): the arguments
   * after the name bind the listener's parameters. Node's `EventEmitter`,
   * `mitt` and the like share the shape; the receiver is matched by symbol and
   * the event by its literal name.
   */
  private connectEmitter(call: CollectorCallInfo): void {
    const event = (node: TypeScript.Node, names: RegExp) => {
      if (!this.ts.isCallExpression(node) || !this.ts.isPropertyAccessExpression(node.expression) || !names.test(node.expression.name.text)) return null;
      const name = node.arguments[0];
      const receiver = this.symbolId(node.expression.expression);
      return name && this.ts.isStringLiteralLike(name) && receiver ? { name: name.text, receiver } : null;
    };
    const emitted = event(call.node, /^emit$/);
    if (!emitted || !this.ts.isCallExpression(call.node)) return;
    if (this.ts.isPropertyAccessExpression(call.node.expression)) this.requireReferences(call.node.expression.expression);
    const args = call.node.arguments.slice(1);
    for (const other of this.calls) {
      const listened = event(other.node, /^(on|once|addListener|prependListener)$/);
      if (!listened || listened.name !== emitted.name || listened.receiver !== emitted.receiver || !this.ts.isCallExpression(other.node) || !other.node.arguments[1]) continue;
      const fn = unwrap(this.ts, other.node.arguments[1]);
      const listener = this.functionsByNode.get(nodeKey(this.root, fn)) ?? this.targetFunction(fn);
      listener?.declaration.parameters.forEach((parameter, index) => {
        const binding = firstBindingIdentifier(this.ts, parameter.name);
        const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
        if (!args[index] || !parameterId) return;
        const where = [this.location(args[index]!), this.location(parameter)];
        this.addRelation(this.expression(args[index]!, call.ownerId), parameterId, "argument-binding", where, proof("argument-binding", `The emitter runs the "${emitted.name}" listener with this argument.`, where), "proven");
      });
    }
  }

  /**
   * A call through a parameter (`visit(item)`) or a prop (`props.onSave(v)`)
   * runs each function a caller hands in there: a call's argument, or a JSX
   * occurrence's attribute. Its arguments bind that function's parameters and
   * its returns come back out here. Each binding's proof names where the
   * function was handed in, and the slice follows it only from that call or
   * occurrence (`evidence-slice.ts`), so two callers' handlers never cross.
   */
  /**
   * What the program's occurrences of a component hand in for one prop. A
   * prop a caller hands on from its own props (`onRemove={props.onRemove}`)
   * is what that caller's own occurrences hand in, a few levels up.
   */
  private handedProps(props: ReadonlyMap<string, readonly PendingComponentPropBinding[]>, ownerId: string, name: string, depth: number): { value: TypeScript.Node; paired: boolean }[] {
    // The children a component's elements hand in are written where it is rendered: load those places.
    const owner = name === "children" ? this.functionsById.get(ownerId) : undefined;
    const named = owner ? functionNameNode(this.ts, owner.declaration as TypeScript.FunctionLikeDeclaration) : null;
    if (named) this.requireReferences(named);
    const children = name === "children" ? this.childFunctions.filter((item) => item.target === ownerId).map((item) => ({ value: item.value as TypeScript.Node, paired: true })) : [];
    return [...children, ...(props.get(ownerId) ?? []).flatMap((pending) => {
      const value = pending.attribute.initializer && this.ts.isJsxExpression(pending.attribute.initializer) ? pending.attribute.initializer.expression : undefined;
      if (pending.target.id !== ownerId || pending.attribute.name.getText() !== name || !value) return [];
      const read = unwrap(this.ts, value);
      const receiver = this.ts.isPropertyAccessExpression(read) && this.ts.isIdentifier(read.expression) ? this.checker.getSymbolAtLocation(read.expression)?.valueDeclaration : undefined;
      const caller = receiver && this.ts.isParameter(receiver) && receiver.parent.parameters[0] === receiver ? this.functionsByNode.get(nodeKey(this.root, receiver.parent)) : undefined;
      const outer = caller && depth < 4 && this.ts.isPropertyAccessExpression(read) ? this.handedProps(props, caller.id, read.name.text, depth + 1) : [];
      return outer.length ? outer : [{ value, paired: true }];
    })];
  }

  /** Functions written as a component element's one child, by the component they are handed to (its `children` prop). */
  private readonly childFunctions: { target: string; value: TypeScript.Expression }[] = [];

  private connectBoundHandlers(call: CollectorCallInfo, props: ReadonlyMap<string, readonly PendingComponentPropBinding[]>): void {
    if (!this.ts.isCallExpression(call.node)) return;
    const node = call.node;
    const slot = this.handlerSlot(node.expression);
    // A handler handed in by a caller is paired with that caller; a context's provider is above every reader, so its handler is not.
    const handed: { value: TypeScript.Node; paired: boolean }[] = !slot
      ? [...this.contextMethod(node.expression), ...this.storeMethod(node.expression)].map((value) => ({ value, paired: false }))
      : typeof slot.index === "number"
        ? this.calls.flatMap((outer) => outer.target?.id === slot.owner.id && this.ts.isCallExpression(outer.node) && outer.node.arguments[slot.index as number] ? [{ value: outer.node.arguments[slot.index as number], paired: true }] : [])
        : this.handedProps(props, slot.owner.id, slot.index, 0);
    for (const { value, paired } of handed) {
      const boundAt = this.location(value);
      const handledBy = (detail: string, where: ProgramEvidenceLocation[]) => paired ? proof("bound-handler", detail, [...where, boundAt]) : proof("argument-binding", detail, where);
      // A state setter handed in (`onPick={setPicked}`): the call's argument is the new state.
      const role = this.ts.isExpression(value) ? stateRoleOf(this.ts, this.checker, value) : null;
      const action = role?.role === "setter" ? this.reducerAction(role.getter) : null;
      if (action) {
        // A dispatch handed in runs the reducer as a direct one does: the action is its parameter, and only what it returns is the state.
        if (!node.arguments[0]) continue;
        const where = [this.location(node.arguments[0]), this.location(action.parameter)];
        this.addRelation(this.expression(node.arguments[0], call.ownerId), action.id, "argument-binding", where, handledBy(`The call runs the dispatch handed in at ${value.getText()}: the reducer receives this action.`, where), "proven");
        continue;
      }
      if (role?.role === "setter" && node.arguments[0]) {
        // The proof's first two locations are the argument and the state, so a paired proof's third is where the setter was handed in, as for a function.
        const where = [this.location(node.arguments[0]), this.location(role.getter)];
        this.addRelation(this.expression(node.arguments[0], call.ownerId), this.stateElement(role.getter), "argument-binding", where, handledBy(`The call runs the setter handed in at ${value.getText()}: its argument becomes the state.`, where), "partial");
        continue;
      }
      const fn = this.ts.isExpression(value) ? unwrap(this.ts, value) : value;
      const handler = this.functionsByNode.get(nodeKey(this.root, fn)) ?? this.targetFunction(fn);
      if (!handler || handler.id === slot?.owner.id) continue;
      handler.declaration.parameters.forEach((parameter, index) => {
        const argument = node.arguments[index];
        const binding = firstBindingIdentifier(this.ts, parameter.name);
        const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
        if (!argument || !parameterId) return;
        const where = [this.location(argument), this.location(parameter)];
        this.addRelation(this.expression(argument, call.ownerId), parameterId, "argument-binding", where, handledBy(`The call runs the function handed in at ${value.getText()}: the argument binds its parameter.`, where), "proven");
      });
      for (const returnId of this.returnsByFunction.get(handler.id) ?? []) {
        const where = [this.location(node), this.location(value)];
        this.addRelation(returnId, call.id, "return-value", where, handledBy(`The call returns what the function handed in at ${value.getText()} returns.`, where), "proven");
      }
    }
  }

  /**
   * A store hook (`const useStore = create((set) => ({ … }))`, a `store` row,
   * curried `create<T>()(fn)` too) holds one state, which its creators make:
   * the function handed to `create`, through any middleware that takes and
   * hands back a `StateCreator` (`persist(fn)`, `immer(fn)`), and each slice
   * creator that function calls with its own `(set, get, api)`. What each
   * creator returns is the state, and so is what each `set(…)` in it receives:
   * an updater's return, or what an immer updater writes into its draft.
   * `useStore.setState(…)` is the same `set`. Calling the hook with a selector
   * (`useStore((s) => s.count)`) hands the selector that state, and its return
   * is the call's value; without one, the call is the state, as
   * `useStore.getState()` is. Order and time are not proven, as for a state pair.
   */
  /**
   * A call that watches a function it is given (`useSubmission(action)`, a
   * `watchedFunction` row): its result's `field` holds what the function
   * returns, and its `input` each call's arguments, by position. The function
   * is the one the action wraps, however it is reached (`resolveValue`).
   */
  private connectWatchedFunctions(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const imported = importedCallee(this.ts, this.checker, call.node.expression);
      const fields = imported ? watchedFunction(imported.module, imported.name) : null;
      const argument = fields ? call.node.arguments[fields.at] : undefined;
      const fn = argument ? this.targetFunction(unwrap(this.ts, argument)) : null;
      if (!fields || !argument || !fn) continue;
      const node = call.node;
      const key = (item: TypeScript.Node) => { const { span } = this.location(item); return `${span.startLine}:${span.startColumn}`; };
      const detail = (words: string, at: TypeScript.Node = node) => proof("framework-state", words, [this.location(at)]);
      const packed = { [key(argument)]: fields.field, ...(fields.input ? { [key(node.expression)]: fields.input } : {}) };
      const packId = this.ensureElement(node, "object-pack", call.ownerId, { operation: "object-pack", fields: JSON.stringify(packed) }, null, null, null, "proven", detail("The call's result is an object of fields the watched function fills."));
      for (const returnId of this.returnsByFunction.get(fn.id) ?? []) {
        this.addRelation(returnId, packId, "pack-field", [this.location(argument)], detail(`The result's ${fields.field} is what the watched function returns.`, argument), "proven");
      }
      for (const other of fields.input ? this.calls : []) {
        if (other.target?.id !== fn.id || !this.ts.isCallExpression(other.node) || other.node.arguments.length === 0) continue;
        const args = other.node.arguments;
        const listId = this.ensureElement(other.node, "object-pack", other.ownerId, { operation: "object-pack", fields: JSON.stringify(Object.fromEntries(args.map((item, index) => [key(item), String(index)]))) }, null, null, null, "proven", detail("The call's arguments, as a list."));
        for (const item of args) this.addRelation(this.expression(item, other.ownerId), listId, "pack-field", [this.location(item)], detail("This call of the watched function passes this argument.", item), "proven");
        this.addRelation(listId, packId, "pack-field", [this.location(node.expression)], detail(`The result's ${fields.input} holds the arguments of each call of the watched function.`, node.expression), "proven");
      }
      this.addRelation(packId, call.id, "framework-flow", [this.location(node)], detail("The call yields the watched function's result fields."), "proven");
    }
  }

  private connectStores(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const holder = call.node.parent;
      if (!this.ts.isVariableDeclaration(holder) || !this.ts.isIdentifier(holder.name)) continue;
      const creators = storeCreators(this.ts, this.checker, call.node);
      const hook = this.checker.getSymbolAtLocation(holder.name);
      if (!creators || !hook || !this.functionsByNode.has(nodeKey(this.root, creators[0]))) continue;
      const stateId = this.stateElement(holder.name);
      this.stores.set(hook, stateId);
      for (const creator of creators) {
        const info = this.functionsByNode.get(nodeKey(this.root, creator));
        if (!info) continue;
        const detail = creator === creators[0] ? "The store starts as what its function returns; order and time are not proven." : "A slice called with the store's set, get and api adds what it returns to the store.";
        for (const returnId of this.returnsByFunction.get(info.id) ?? []) this.storeWrite(stateId, returnId, creator, detail);
        const set = creator.parameters[0] && this.ts.isIdentifier(creator.parameters[0].name) ? this.checker.getSymbolAtLocation(creator.parameters[0].name) : undefined;
        if (!set) continue;
        const visit = (node: TypeScript.Node) => {
          if (this.ts.isCallExpression(node) && this.ts.isIdentifier(node.expression) && this.checker.getSymbolAtLocation(node.expression) === set) this.storeSet(stateId, node, info.id);
          this.ts.forEachChild(node, visit);
        };
        visit(creator.body);
      }
    }
    if (this.stores.size === 0) return;
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const where = [this.location(call.node)];
      const api = storeApiCall(this.ts, this.checker, call.node);
      const apiState = api ? this.stores.get(api.hook) : undefined;
      if (apiState && api?.name === "setState") this.storeSet(apiState, call.node, call.ownerId);
      if (apiState && api?.name === "getState") this.addRelation(apiState, call.id, "references", where, proof("framework-state", "The store's getState() reads the store.", where), "partial");
      if (!this.ts.isIdentifier(call.node.expression)) continue;
      const stateId = this.stores.get(this.checker.getSymbolAtLocation(call.node.expression)!);
      if (!stateId) continue;
      const selector = call.node.arguments[0] && unwrap(this.ts, call.node.arguments[0]);
      const info = selector && (this.ts.isArrowFunction(selector) || this.ts.isFunctionExpression(selector)) ? this.functionsByNode.get(nodeKey(this.root, selector)) : undefined;
      if (!info) {
        this.addRelation(stateId, call.id, "references", where, proof("framework-state", "The store hook's call reads the store.", where), "partial");
        continue;
      }
      const parameterId = this.firstParameterId(selector);
      if (parameterId) this.addRelation(stateId, parameterId, "references", where, proof("framework-state", "The selector receives the store.", where), "partial");
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) this.addRelation(returnId, call.id, "framework-flow", where, proof("framework-state", "The store hook's call yields what its selector returns.", where), "proven");
    }
  }

  private storeWrite(stateId: string, fromId: string, at: TypeScript.Node, detail: string): void {
    this.addRelation(fromId, stateId, "framework-flow", [this.location(at)], proof("framework-state", detail, [this.location(at)]), "partial");
  }

  /** A store's `set(…)` (or `useStore.setState(…)`): an updater's return, what an immer updater writes into its draft, or else the value itself, is merged into the store. */
  private storeSet(stateId: string, node: TypeScript.CallExpression, ownerId: string | null): void {
    const argument = node.arguments[0];
    if (!argument) return;
    const value = unwrap(this.ts, argument);
    if (!this.ts.isArrowFunction(value) && !this.ts.isFunctionExpression(value)) {
      this.storeWrite(stateId, this.expression(argument, ownerId), node, "What set receives is merged into the store.");
      return;
    }
    const updater = this.functionsByNode.get(nodeKey(this.root, value));
    for (const returnId of updater ? this.returnsByFunction.get(updater.id) ?? [] : []) this.storeWrite(stateId, returnId, value, "What the updater handed to set returns becomes the store.");
    const draft = value.parameters[0];
    const draftId = draft && this.ts.isIdentifier(draft.name) && isImmerDraft(this.ts, this.checker, draft) ? this.parametersBySymbol.get(this.symbolId(draft.name) ?? "") : undefined;
    if (draftId) this.storeWrite(stateId, draftId, draft, "set runs the updater on an immer draft: what it writes into the draft becomes the store.");
  }

  /** The function a store's member names, read through its hook (`storeMember`). */
  private storeMethod(callee: TypeScript.Expression): TypeScript.Node[] {
    return this.stores.size === 0 ? [] : storeMember(this.ts, this.checker, callee);
  }

  /**
   * The functions a context names: a method of its value (`store.save` after
   * `const store = useContext(Store)`, or a destructured `{ save }`), the
   * `save` of each provider's value object; or the value itself when it is a
   * function (`const dispatch = useContext(Dispatch)`), each provided value.
   */
  private readonly contextMethods = new WeakMap<TypeScript.Expression, { context: string; name: string | null } | null>();

  private contextMethod(callee: TypeScript.Expression): TypeScript.Node[] {
    if (!this.contextMethods.has(callee)) this.contextMethods.set(callee, this.contextMethodBinding(callee));
    const binding = this.contextMethods.get(callee);
    if (!binding) return [];
    const { context, name } = binding;
    return (this.contextValues.get(context) ?? []).flatMap<TypeScript.Node>((provided) => {
      if (name === null) return [provided];
      const value = unwrap(this.ts, provided);
      if (!this.ts.isObjectLiteralExpression(value)) return [];
      const member = value.properties.find((property) => property.name && this.ts.isIdentifier(property.name) && property.name.text === name);
      if (!member) return [];
      if (this.ts.isPropertyAssignment(member)) return [member.initializer];
      if (this.ts.isShorthandPropertyAssignment(member)) return [member.name];
      return this.ts.isMethodDeclaration(member) ? [member] : [];
    });
  }

  private contextMethodBinding(callee: TypeScript.Expression): { context: string; name: string | null } | null {
    const node = unwrap(this.ts, callee);
    let holder: TypeScript.Expression | undefined;
    let name: string | null = null;
    if (this.ts.isPropertyAccessExpression(node)) {
      holder = unwrap(this.ts, node.expression);
      name = node.name.text;
      if (this.ts.isIdentifier(holder)) {
        const declaration = this.checker.getSymbolAtLocation(holder)?.valueDeclaration;
        if (!declaration || !this.ts.isVariableDeclaration(declaration) || !this.ts.isIdentifier(declaration.name) || !declaration.initializer) return null;
        holder = unwrap(this.ts, declaration.initializer);
      }
    } else if (this.ts.isIdentifier(node)) {
      const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (declaration && this.ts.isVariableDeclaration(declaration) && this.ts.isIdentifier(declaration.name) && declaration.initializer) holder = unwrap(this.ts, declaration.initializer);
      else if (declaration && this.ts.isBindingElement(declaration) && this.ts.isObjectBindingPattern(declaration.parent) && this.ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer && !declaration.dotDotDotToken) {
        const key = declaration.propertyName ?? declaration.name;
        if (!this.ts.isIdentifier(key)) return null;
        holder = unwrap(this.ts, declaration.parent.parent.initializer);
        name = key.text;
      }
    }
    const read = holder ? this.contextRead(holder) : null;
    const context = read ? this.contextKey(read.arguments[0]) : null;
    return context ? { context, name } : null;
  }

  /**
   * A handler written with its data (`[remove, id]`) where the attribute's
   * own type says so: a tuple whose first element is a function (Solid's
   * `BoundEventHandler`). The data binds the handler's first parameter.
   */
  private bindsEventData(value: TypeScript.Expression, ownerId: string | null): boolean {
    const pair = unwrap(this.ts, value);
    if (!isBoundHandlerPair(this.ts, this.checker, pair)) return false;
    const [handlerNode, data] = pair.elements;
    const handler = this.targetFunction(unwrap(this.ts, handlerNode));
    const parameter = handler?.declaration.parameters[0];
    const binding = parameter ? firstBindingIdentifier(this.ts, parameter.name) : null;
    const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
    if (parameterId) {
      const where = [this.location(data), this.location(parameter!)];
      this.addRelation(this.expression(data, ownerId), parameterId, "argument-binding", where, proof("argument-binding", "The page calls the bound handler with this data as its first argument.", where), "proven");
    }
    return true;
  }

  /** The context read and position a callee takes from a context's tuple (`const [, setName] = useContext(Ctx)`), or null. */
  private contextTupleElement(callee: TypeScript.Expression): { read: TypeScript.CallExpression; index: number } | null {
    const node = unwrap(this.ts, callee);
    const element = this.ts.isIdentifier(node) ? this.checker.getSymbolAtLocation(node)?.valueDeclaration : undefined;
    if (!element || !this.ts.isBindingElement(element) || element.dotDotDotToken || !this.ts.isArrayBindingPattern(element.parent)) return null;
    const declaration = element.parent.parent;
    const read = this.ts.isVariableDeclaration(declaration) && declaration.initializer ? this.contextRead(declaration.initializer) : null;
    const index = element.parent.elements.indexOf(element);
    return read && index <= 1 ? { read, index } : null;
  }

  protected override contextPairHalf(callee: TypeScript.Expression): boolean {
    return this.contextTupleElement(callee) !== null;
  }

  /**
   * A state pair provided whole through a context (`value={pair}` after
   * `const pair = createSignal("")`): a reader's element 0 is its getter and
   * element 1 its setter, so the setter's argument becomes the state the
   * getter's calls read, as for a destructured pair. Order and time are not proven.
   */
  private connectContextPairs(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const half = this.contextTupleElement(call.node.expression);
      const context = half ? this.contextKey(half.read.arguments[0]) : null;
      if (!half || !context) continue;
      const above = this.contextAncestry.above(half.read, context);
      const where = [this.location(call.node)];
      for (const provided of this.contextValues.get(context) ?? []) {
        if (!contextApplies(above, provided)) continue;
        const value = unwrap(this.ts, provided);
        const declaration = this.ts.isIdentifier(value) ? this.checker.getSymbolAtLocation(value)?.valueDeclaration : undefined;
        if (!declaration || !this.ts.isVariableDeclaration(declaration) || !this.ts.isIdentifier(declaration.name) || !declaration.initializer || !stateFactory(this.ts, this.checker, declaration.initializer)) continue;
        const stateId = this.stateElement(declaration.name);
        if (half.index === 0) {
          this.addRelation(stateId, call.id, "references", where, proof("framework-state", "The context's getter reads the state its setter writes; order and time are not proven.", where), "partial");
          continue;
        }
        const argument = call.node.arguments.length === 1 ? unwrap(this.ts, call.node.arguments[0]) : undefined;
        if (!argument || this.ts.isArrowFunction(argument) || this.ts.isFunctionExpression(argument)) continue;
        const at = [this.location(argument)];
        this.addRelation(this.expression(argument, call.ownerId), stateId, "references", at, proof("framework-state", "The context's setter's argument becomes the state its getter reads; order and time are not proven.", at), "partial");
      }
    }
  }

  /**
   * The `useContext(Ctx)` call an expression is: the call itself, or a call of
   * a hook of the program's whose one return is that call
   * (`const useCart = () => useContext(CartContext)!`). Null otherwise.
   */
  private contextRead(expression: TypeScript.Expression): TypeScript.CallExpression | null {
    const call = unwrap(this.ts, expression);
    if (!this.ts.isCallExpression(call)) return null;
    const imported = importedCallee(this.ts, this.checker, call.expression);
    if (imported?.name === "useContext" && (imported.module === "solid-js" || imported.module === "react")) return call.arguments[0] ? call : null;
    if (imported) return null;
    const hook = this.targetFunction(call.expression)?.declaration;
    const body = hook && "body" in hook ? hook.body : undefined;
    if (!body) return null;
    const returned = this.ts.isBlock(body)
      ? body.statements.length === 1 && this.ts.isReturnStatement(body.statements[0]) ? body.statements[0].expression : undefined
      : body;
    const inner = returned ? unwrap(this.ts, returned) : undefined;
    if (!inner || !this.ts.isCallExpression(inner)) return null;
    const read = importedCallee(this.ts, this.checker, inner.expression);
    return read?.name === "useContext" && (read.module === "solid-js" || read.module === "react") && inner.arguments[0] ? inner : null;
  }

  /**
   * The slot a callee reads a function from: a parameter of the function it is
   * written in (`index` its position), or a prop of a component's first
   * parameter (`index` the prop's name), through `props.onSave` or a
   * destructured `{ onSave }`.
   */
  private readonly handlerSlots = new WeakMap<TypeScript.Expression, { owner: CollectorFunctionInfo; index: number | string } | null>();

  private handlerSlot(callee: TypeScript.Expression): { owner: CollectorFunctionInfo; index: number | string } | null {
    if (this.handlerSlots.has(callee)) return this.handlerSlots.get(callee)!;
    const slot = this.findHandlerSlot(callee);
    this.handlerSlots.set(callee, slot);
    return slot;
  }

  private findHandlerSlot(callee: TypeScript.Expression): { owner: CollectorFunctionInfo; index: number | string } | null {
    const node = unwrap(this.ts, callee);
    const ownerOf = (parameter: TypeScript.ParameterDeclaration) => this.functionsByNode.get(nodeKey(this.root, parameter.parent)) ?? null;
    if (this.ts.isPropertyAccessExpression(node) && this.ts.isIdentifier(node.expression)) {
      const declaration = this.checker.getSymbolAtLocation(node.expression)?.valueDeclaration;
      if (!declaration || !this.ts.isParameter(declaration) || declaration.parent.parameters[0] !== declaration) return null;
      const owner = ownerOf(declaration);
      return owner ? { owner, index: node.name.text } : null;
    }
    if (!this.ts.isIdentifier(node)) return null;
    const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
    if (!declaration) return null;
    if (this.ts.isParameter(declaration)) {
      const owner = ownerOf(declaration);
      return owner ? { owner, index: declaration.parent.parameters.indexOf(declaration) } : null;
    }
    // `function Editor({ onSave })`: the prop the binding takes from the first parameter.
    if (this.ts.isBindingElement(declaration) && this.ts.isObjectBindingPattern(declaration.parent) && this.ts.isParameter(declaration.parent.parent) && declaration.parent.parent.parent.parameters[0] === declaration.parent.parent && !declaration.dotDotDotToken) {
      const key = declaration.propertyName ?? declaration.name;
      const owner = ownerOf(declaration.parent.parent);
      return owner && this.ts.isIdentifier(key) ? { owner, index: key.text } : null;
    }
    return null;
  }

  /**
   * The `state` member a static `getDerivedStateFromError` or
   * `getDerivedStateFromProps` writes: the one its class declares, when the
   * class extends React's `Component` or `PureComponent`. Null otherwise.
   */
  private derivedStateMember(declaration: TypeScript.SignatureDeclaration): string | null {
    if (!this.ts.isMethodDeclaration(declaration) || !this.ts.isIdentifier(declaration.name) || !/^getDerivedStateFrom(Error|Props)$/.test(declaration.name.text)) return null;
    if (!this.ts.getModifiers(declaration)?.some((modifier) => modifier.kind === this.ts.SyntaxKind.StaticKeyword)) return null;
    const owner = declaration.parent;
    if (!this.ts.isClassLike(owner)) return null;
    const base = owner.heritageClauses?.find((clause) => clause.token === this.ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
    const imported = base ? importedCallee(this.ts, this.checker, base) : null;
    if (imported?.module !== "react" || !/^(Component|PureComponent)$/.test(imported.name)) return null;
    const state = owner.members.find((member) => this.ts.isPropertyDeclaration(member) && !this.ts.getModifiers(member)?.some((modifier) => modifier.kind === this.ts.SyntaxKind.StaticKeyword) && this.ts.isIdentifier(member.name) && member.name.text === "state");
    return state?.name ? this.symbolId(state.name) : null;
  }

  /** Every read of a member the project declares sees what was written into it (`memberWrites`). */
  private connectMemberState(): void {
    // A parameter property (`constructor(public label: string)`) writes its member, as `this.label = label` would.
    // A getter that reads `this` reads it from the receiver of each read of its member (`state.full` binds `this` to `state`).
    const getterThis = new Map<string, string>();
    for (const fn of this.functionsById.values()) {
      // A getter's returns are what each read of its member sees (`named.shout`).
      if (this.ts.isGetAccessorDeclaration(fn.declaration)) {
        const key = this.symbolId(fn.declaration.name);
        if (key) this.memberWrites.set(key, [...(this.memberWrites.get(key) ?? []), ...(this.returnsByFunction.get(fn.id) ?? [])]);
        const thisId = key ? this.thisBinding(fn.declaration) : null;
        if (key && thisId) getterThis.set(key, thisId);
      }
      // React merges what a class component's static `getDerivedStateFromError` or `getDerivedStateFromProps` returns into its `state`.
      const stateKey = this.derivedStateMember(fn.declaration);
      if (stateKey) this.memberWrites.set(stateKey, [...(this.memberWrites.get(stateKey) ?? []), ...(this.returnsByFunction.get(fn.id) ?? [])]);
      if (!this.ts.isConstructorDeclaration(fn.declaration)) continue;
      for (const parameter of fn.declaration.parameters) {
        if (!this.ts.isParameterPropertyDeclaration(parameter, fn.declaration) || !this.ts.isIdentifier(parameter.name)) continue;
        const property = this.checker.getSymbolsOfParameterPropertyDeclaration(parameter, parameter.name.text)[1];
        const key = property ? compilerSymbolId(this.ts, this.checker, this.root, parameter.name, property) : null;
        const parameterId = this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "");
        if (key && parameterId) this.memberWrites.set(key, [...(this.memberWrites.get(key) ?? []), parameterId]);
      }
    }
    if (this.memberWrites.size === 0) return;
    for (const read of this.memberReads) {
      this.checkCancellation();
      const key = this.memberSymbol(read.node);
      const writes = key ? this.memberWrites.get(key) : undefined;
      if (!writes) continue;
      const readId = this.elementIfPresent(read.node, "field-read") ?? this.expression(read.node, read.ownerId);
      const thisId = getterThis.get(key!);
      if (thisId) {
        const where = [this.location(read.node.expression)];
        this.addRelation(this.expression(read.node.expression, read.ownerId), thisId, "argument-binding", where, proof("argument-binding", "Reading the member runs its getter with this receiver as `this`.", where), "proven");
      }
      for (const valueId of writes) {
        if (valueId === readId) continue;
        this.addRelation(valueId, readId, "member-state", [this.location(read.node)], proof("compiler-symbol", "The checker names the same member this value was written into.", [this.location(read.node)]), "proven");
      }
    }
  }

  protected connectPendingReferences(references = this.references): void {
    for (const reference of references) {
      this.checkCancellation();
      // A state pair's getter reads its state, not the pattern it was declared in (which its setter shares).
      const target = reference.symbolId
        ? this.stateBySymbol.get(reference.symbolId) ?? this.variablesBySymbol.get(reference.symbolId)
        : null;
      const assigned = reference.symbolId ? this.assignments.get(reference.symbolId) : undefined;
      if (assigned) {
        // A reassigned variable: the read sees the bindings that can reach it (a parameter's own binding is already related).
        const declared = target ? [{ id: target, node: assigned.declaration }] : this.ts.isParameter(assigned.declaration) ? [{ id: null, node: assigned.declaration }] : [];
        const reaching = reachingBindings(this.ts, reference.node, assigned.declaration, [...declared, ...assigned.bindings]);
        for (const binding of reaching) {
          if (!binding.id) continue;
          this.addRelation(
            binding.id,
            reference.id,
            "references",
            [this.location(reference.node)],
            proof(
              "compiler-symbol",
              reaching.length === 1 ? "The read sees this binding of the variable." : `The read sees this binding of the variable, one of ${reaching.length} that can reach it.`,
              [this.location(reference.node)],
            ),
            reaching.length === 1 ? "proven" : "partial",
          );
        }
        continue;
      }
      if (target) {
        this.addRelation(
          target,
          reference.id,
          "references",
          [this.location(reference.node)],
          proof(
            "compiler-symbol",
            "The reference resolves to a source variable declaration.",
            [this.location(reference.node)],
          ),
          "proven",
        );
      }
    }
  }
}

/** The module specifier a loader imports (`() => import("./chart")`), or null. */
function importedModule(ts: typeof TypeScript, value: TypeScript.Expression): TypeScript.Expression | null {
  if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value)) return null;
  const returned = returnedExpressions(ts, value);
  const call = returned.length === 1 ? unwrap(ts, returned[0]) : null;
  return call && ts.isCallExpression(call) && call.expression.kind === ts.SyntaxKind.ImportKeyword && call.arguments[0] ? call.arguments[0] : null;
}

/** Whether a function only loads a module (`() => import("./chart")`). */
function loadsModule(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration): boolean {
  return (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && importedModule(ts, fn) !== null;
}

/** What a function's own returns hand back (not a nested function's). */
function returnedExpressions(ts: typeof TypeScript, fn: TypeScript.SignatureDeclaration): TypeScript.Expression[] {
  const body = (fn as { body?: TypeScript.Node }).body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body as TypeScript.Expression];
  const found: TypeScript.Expression[] = [];
  const visit = (node: TypeScript.Node) => {
    if (asFunctionLike(ts, node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}
