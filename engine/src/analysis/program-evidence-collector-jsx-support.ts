import * as TypeScript from "typescript";
import type { ProgramElementKind } from "./program-evidence";
import type { CollectorCallInfo, CollectorFunctionInfo } from "./program-evidence-collector-support";
import type { PendingComponentPropBinding } from "./program-evidence-collector-component-binding";
import { ProgramEvidenceCollectorFieldTransferSupport } from "./program-evidence-collector-field-transfers";
import { reachingBindings } from "./program-evidence-reaching-bindings";
import { resolveValue } from "./value-origin";
import { stateRoleOf } from "./program-evidence-state-pairs";
import { makesStore } from "./framework-flows";
import type { ProgramEvidenceLocation } from "./program-evidence";
import { isSolidComponent } from "./program-evidence-collector-field-transfer-ast";
import {
  asFunctionLike,
  browserMember,
  browserPropertyRead,
  compilerSymbolId,
  derivedOperands,
  importedCallee,
  isAssignmentOperator,
  firstBindingIdentifier,
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
  private readonly stores = new Map<TypeScript.Symbol, { stateId: string; fn: TypeScript.ArrowFunction | TypeScript.FunctionExpression }>();
  /** Each context's provided values as written (`value={{ save }}`), to find the function a context method names. */
  private readonly contextValues = new Map<string, TypeScript.Expression[]>();

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
      if (this.ts.isObjectLiteralExpression(node) || this.ts.isArrayLiteralExpression(node)) {
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
      if (this.ts.isBinaryExpression(node) && isAssignmentOperator(this.ts, node.operatorToken.kind) && this.ts.isPropertyAccessExpression(node.left)) {
        this.processFieldAssignment(node as TypeScript.BinaryExpression & { left: TypeScript.PropertyAccessExpression }, nextOwner);
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
    const rendered = this.renderedComponent(opening.tagName);
    // `<Dynamic component={Card} title={…} />` renders `Card`, and hands it the other attributes.
    const dynamic = rendered.target ? undefined : this.dynamicComponent(opening);
    const { target, aliasId } = dynamic ? { target: this.targetFunction(dynamic), aliasId: null } : rendered;
    const component = Boolean(target || aliasId);
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
    if (target) {
      this.addRelation(
        occurrenceId,
        target.id,
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
        if (target) this.bindSpreadProps(attribute, spreadId, target);
        continue;
      }
      if (!this.ts.isJsxAttribute(attribute)) continue;
      // A component's `label="toc"` is a prop value as much as `label={"toc"}`;
      // on an intrinsic element it is markup, with nothing upstream to trace.
      const value = attribute.initializer && this.ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : component ? attribute.initializer : undefined;
      if (!value || !this.ts.isExpression(value)) continue;
      const valueId = this.expression(value, ownerId);
      const providing = attribute.name.getText() === "value" && this.ts.isPropertyAccessExpression(opening.tagName) && opening.tagName.name.text === "Provider";
      if (providing && this.ts.isPropertyAccessExpression(opening.tagName)) {
        const context = this.contextKey(opening.tagName.expression);
        if (context) this.contextProviders.set(context, [...(this.contextProviders.get(context) ?? []), valueId]);
        if (context) this.contextValues.set(context, [...(this.contextValues.get(context) ?? []), value]);
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
      if (target) {
        this.queueComponentPropBinding(opening, attribute, valueId, occurrenceId, ownerId, target);
      }
      // A context's provided value goes to its readers (`connectContexts`), not into the page.
      if (!component && !(providing && this.ts.isPropertyAccessExpression(opening.tagName) && this.contextKey(opening.tagName.expression))) {
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
  protected renderedComponent(tagName: TypeScript.JsxTagNameExpression): { target: CollectorFunctionInfo | null; aliasId: string | null } {
    const named = this.functionsBySymbol.get(this.symbolId(tagName) ?? "");
    if (named) return { target: named, aliasId: null };
    // `targetFunction` follows the value to the one function it is, through `const` copies and imports.
    return { target: this.targetFunction(tagName), aliasId: this.variablesBySymbol.get(this.symbolId(tagName) ?? "") ?? null };
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
    const { target, aliasId } = this.renderedComponent(opening.tagName);
    if (target || aliasId) {
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
  private contextKey(expression: TypeScript.Expression): string | null {
    const origin = resolveValue(this.ts, this.checker, expression)?.origin;
    if (!origin || !this.ts.isCallExpression(origin)) return null;
    const imported = importedCallee(this.ts, this.checker, origin.expression);
    const factory = imported?.name === "createContext" && (imported.module === "solid-js" || imported.module === "react");
    if (factory) this.requireReferences(expression);
    return factory ? nodeKey(this.root, origin) : null;
  }

  /** `useContext(Ctx)` returns what a `<Ctx.Provider value={…}>` above it provides: every provider of that context. */
  private connectContexts(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const imported = importedCallee(this.ts, this.checker, call.node.expression);
      if (imported?.name !== "useContext" || (imported.module !== "solid-js" && imported.module !== "react")) continue;
      const context = call.node.arguments[0] ? this.contextKey(call.node.arguments[0]) : null;
      for (const valueId of context ? this.contextProviders.get(context) ?? [] : []) {
        this.addRelation(
          valueId,
          call.id,
          "context-value",
          [this.location(call.node)],
          proof("framework-state", "The context's provider supplies the value useContext returns.", [this.location(call.node)]),
          "proven",
        );
      }
    }
  }

  protected connectCalls(): void {
    this.connectContexts();
    this.connectStores();
    const props = this.componentPropBindings;
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
        for (const parameter of call.target.declaration.parameters) {
          this.checkCancellation();
          const index = call.target.declaration.parameters.indexOf(parameter);
          const argument = call.node.arguments?.[index];
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
        const thisId = this.ts.isPropertyAccessExpression(callee) || this.ts.isElementAccessExpression(callee) ? this.thisBinding(call.target.declaration) : null;
        if (thisId && (this.ts.isPropertyAccessExpression(callee) || this.ts.isElementAccessExpression(callee))) {
          const receiverId = this.expression(callee.expression, call.ownerId);
          const at = [this.location(callee.expression)];
          this.addRelation(receiverId, call.id, "argument", at, proof("ast-node", "The receiver is passed to this call as `this`.", at), "proven");
          this.addRelation(receiverId, thisId, "argument-binding", at, proof("argument-binding", "The call's receiver binds to the method's `this`.", at), "proven");
        }
        for (const returnId of this.returnsByFunction.get(call.target.id) ?? []) {
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
  private connectBoundHandlers(call: CollectorCallInfo, props: readonly PendingComponentPropBinding[]): void {
    if (!this.ts.isCallExpression(call.node)) return;
    const node = call.node;
    const slot = this.handlerSlot(node.expression);
    // A handler handed in by a caller is paired with that caller; a context's provider is above every reader, so its handler is not.
    const handed: { value: TypeScript.Node; paired: boolean }[] = !slot
      ? [...this.contextMethod(node.expression), ...this.storeMethod(node.expression)].map((value) => ({ value, paired: false }))
      : typeof slot.index === "number"
        ? this.calls.flatMap((outer) => outer.target?.id === slot.owner.id && this.ts.isCallExpression(outer.node) && outer.node.arguments[slot.index as number] ? [{ value: outer.node.arguments[slot.index as number], paired: true }] : [])
        : props.flatMap((pending) => {
          const value = pending.attribute.initializer && this.ts.isJsxExpression(pending.attribute.initializer) ? pending.attribute.initializer.expression : undefined;
          return pending.target.id === slot.owner.id && pending.attribute.name.getText() === slot.index && value ? [{ value, paired: true }] : [];
        });
    for (const { value, paired } of handed) {
      const boundAt = this.location(value);
      const handledBy = (detail: string, where: ProgramEvidenceLocation[]) => paired ? proof("bound-handler", detail, [...where, boundAt]) : proof("argument-binding", detail, where);
      // A state setter handed in (`onPick={setPicked}`): the call's argument is the new state.
      const role = this.ts.isExpression(value) ? stateRoleOf(this.ts, this.checker, value) : null;
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
   * curried `create<T>()(fn)` too) holds one state: what its function returns,
   * and what each `set(…)` in it receives (an updater's return). Calling the
   * hook with a selector (`useStore((s) => s.count)`) hands the selector that
   * state, and its return is the call's value; without one, the call is the
   * state. Order and time are not proven, as for a state pair.
   */
  private connectStores(): void {
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node)) continue;
      const curried = this.ts.isCallExpression(call.node.expression) ? call.node.expression : null;
      const imported = importedCallee(this.ts, this.checker, (curried ?? call.node).expression);
      const fn = unwrap(this.ts, call.node.arguments[0] ?? call.node);
      const holder = call.node.parent;
      if (!imported || !makesStore(imported.module, imported.name) || (!this.ts.isArrowFunction(fn) && !this.ts.isFunctionExpression(fn))) continue;
      if (!this.ts.isVariableDeclaration(holder) || !this.ts.isIdentifier(holder.name)) continue;
      const hook = this.checker.getSymbolAtLocation(holder.name);
      const info = this.functionsByNode.get(nodeKey(this.root, fn));
      if (!hook || !info) continue;
      const stateId = this.stateElement(holder.name);
      this.stores.set(hook, { stateId, fn });
      const into = (returnId: string, at: TypeScript.Node, detail: string) => this.addRelation(returnId, stateId, "framework-flow", [this.location(at)], proof("framework-state", detail, [this.location(at)]), "partial");
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) into(returnId, fn, "The store starts as what its function returns; order and time are not proven.");
      const set = fn.parameters[0] && this.ts.isIdentifier(fn.parameters[0].name) ? this.checker.getSymbolAtLocation(fn.parameters[0].name) : undefined;
      const visit = (node: TypeScript.Node) => {
        if (set && this.ts.isCallExpression(node) && this.ts.isIdentifier(node.expression) && this.checker.getSymbolAtLocation(node.expression) === set && node.arguments[0]) {
          const value = unwrap(this.ts, node.arguments[0]);
          const updater = this.ts.isArrowFunction(value) || this.ts.isFunctionExpression(value) ? this.functionsByNode.get(nodeKey(this.root, value)) : undefined;
          if (updater) for (const returnId of this.returnsByFunction.get(updater.id) ?? []) into(returnId, value, "What the updater handed to set returns becomes the store.");
          else into(this.expression(node.arguments[0], info.id), node, "What set receives is merged into the store.");
        }
        this.ts.forEachChild(node, visit);
      };
      visit(fn.body);
    }
    if (this.stores.size === 0) return;
    for (const call of this.calls) {
      if (!this.ts.isCallExpression(call.node) || !this.ts.isIdentifier(call.node.expression)) continue;
      const store = this.stores.get(this.checker.getSymbolAtLocation(call.node.expression)!);
      if (!store) continue;
      const selector = call.node.arguments[0] && unwrap(this.ts, call.node.arguments[0]);
      const info = selector && (this.ts.isArrowFunction(selector) || this.ts.isFunctionExpression(selector)) ? this.functionsByNode.get(nodeKey(this.root, selector)) : undefined;
      const where = [this.location(call.node)];
      if (!info) {
        this.addRelation(store.stateId, call.id, "references", where, proof("framework-state", "The store hook's call reads the store.", where), "partial");
        continue;
      }
      const parameterId = this.firstParameterId(selector);
      if (parameterId) this.addRelation(store.stateId, parameterId, "references", where, proof("framework-state", "The selector receives the store.", where), "partial");
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) this.addRelation(returnId, call.id, "framework-flow", where, proof("framework-state", "The store hook's call yields what its selector returns.", where), "proven");
    }
  }

  /**
   * The function a store's member names, read through its hook: `setCount`
   * after `const setCount = useStore((s) => s.setCount)` or a destructured
   * `const { setCount } = useStore()`, the `setCount` of the object the
   * store's function returns.
   */
  private storeMethod(callee: TypeScript.Expression): TypeScript.Node[] {
    if (this.stores.size === 0) return [];
    const node = unwrap(this.ts, callee);
    if (!this.ts.isIdentifier(node)) return [];
    const declaration = this.checker.getSymbolAtLocation(node)?.valueDeclaration;
    let read: TypeScript.Expression | undefined;
    let name: string | undefined;
    if (declaration && this.ts.isVariableDeclaration(declaration) && declaration.initializer) {
      read = unwrap(this.ts, declaration.initializer);
      const selector = this.ts.isCallExpression(read) && read.arguments[0] ? unwrap(this.ts, read.arguments[0]) : undefined;
      const body = selector && this.ts.isArrowFunction(selector) && !this.ts.isBlock(selector.body) ? unwrap(this.ts, selector.body) : undefined;
      name = body && this.ts.isPropertyAccessExpression(body) ? body.name.text : undefined;
    } else if (declaration && this.ts.isBindingElement(declaration) && this.ts.isObjectBindingPattern(declaration.parent) && this.ts.isVariableDeclaration(declaration.parent.parent) && declaration.parent.parent.initializer) {
      read = unwrap(this.ts, declaration.parent.parent.initializer);
      const key = declaration.propertyName ?? declaration.name;
      name = this.ts.isIdentifier(key) ? key.text : undefined;
    }
    if (!read || !name || !this.ts.isCallExpression(read) || !this.ts.isIdentifier(read.expression)) return [];
    const store = this.stores.get(this.checker.getSymbolAtLocation(read.expression)!);
    const made = store && !this.ts.isBlock(store.fn.body) ? unwrap(this.ts, store.fn.body) : undefined;
    if (!made || !this.ts.isObjectLiteralExpression(made)) return [];
    const member = made.properties.find((property) => property.name && this.ts.isIdentifier(property.name) && property.name.text === name);
    if (member && this.ts.isPropertyAssignment(member)) return [member.initializer];
    return member && this.ts.isMethodDeclaration(member) ? [member] : [];
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
    if (!holder || !this.ts.isCallExpression(holder) || !holder.arguments[0]) return null;
    const imported = importedCallee(this.ts, this.checker, holder.expression);
    if (imported?.name !== "useContext" || (imported.module !== "solid-js" && imported.module !== "react")) return null;
    const context = this.contextKey(holder.arguments[0]);
    return context ? { context, name } : null;
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

  /** Every read of a member the project declares sees what was written into it (`memberWrites`). */
  private connectMemberState(): void {
    // A parameter property (`constructor(public label: string)`) writes its member, as `this.label = label` would.
    for (const fn of this.functionsById.values()) {
      // A getter's returns are what each read of its member sees (`named.shout`).
      if (this.ts.isGetAccessorDeclaration(fn.declaration)) {
        const key = this.symbolId(fn.declaration.name);
        if (key) this.memberWrites.set(key, [...(this.memberWrites.get(key) ?? []), ...(this.returnsByFunction.get(fn.id) ?? [])]);
      }
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
