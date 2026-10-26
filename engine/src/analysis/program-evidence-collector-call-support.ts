import * as TypeScript from "typescript";
import type { ProgramElementKind, ProgramEvidenceLocation } from "./program-evidence";
import { processProgramCallBoundary } from "./program-evidence-boundary-support";
import {
  collectProgramEvidenceExpression,
  constructorExpressionElementEvidence,
} from "./program-evidence-collector-expression-support";
import { stateFactory, stateRoleOf } from "./program-evidence-state-pairs";
import { ProgramEvidenceCollectorDeclarations } from "./program-evidence-collector-declarations";
import type { CollectorCallInfo } from "./program-evidence-collector-support";
import {
  bindingIdentifiers,
  calleeName,
  callOperation,
  firstBindingIdentifier,
  isKnownGlobal,
  isResourceFactory,
  nodeKey,
  readsThis,
  thisContainer,
  proof,
  assumedProof,
  discardsValue,
  unwrap,
} from "./program-evidence-support";

function frameworkState(detail: string, location: ProgramEvidenceLocation) {
  return proof("framework-state", detail, [location]);
}

export class ProgramEvidenceCollectorCallSupport extends ProgramEvidenceCollectorDeclarations {
  protected processVariable(
    node: TypeScript.VariableDeclaration,
    ownerId: string | null,
  ): void {
    const initializer = node.initializer;
    if (!initializer) return;
    const aliasId =
      this.variablesBySymbol.get(
        this.symbolId(firstBindingIdentifier(this.ts, node.name)) ?? "",
      ) ?? this.elementFor(node, "alias");
    const initializerId = this.expression(initializer, ownerId);
    const factory = stateFactory(this.ts, this.checker, initializer);
    const first = this.ts.isArrayBindingPattern(node.name) ? node.name.elements[0] : undefined;
    const getter = factory && first && this.ts.isBindingElement(first) && this.ts.isIdentifier(first.name) ? first.name : null;
    if (getter) {
      // A state pair: the initial value seeds the state the getter reads.
      const stateId = this.stateElement(getter);
      const symbolId = this.symbolId(getter);
      if (symbolId) this.stateBySymbol.set(symbolId, stateId);
      // The factory's call (its arguments, the initial value among them) seeds the state.
      this.addRelation(initializerId ?? aliasId, stateId, "references", [this.location(initializer)], frameworkState("The factory's initial value seeds the state its getter reads.", this.location(initializer)), "partial");
    }
    // A state pair's `[getter, setter]` binds two functions, not the value: the value goes through the state.
    if (initializerId && !getter) {
      this.addRelation(
        initializerId,
        aliasId,
        "references",
        [this.location(initializer)],
        proof(
          "ast-node",
          "The variable initializer is assigned to the declared binding.",
          [this.location(node)],
        ),
        "proven",
      );
    }
    if (!isResourceFactory(this.ts, this.checker, initializer)) return;
    if (!this.ts.isCallExpression(initializer)) return;
    const resourceId = this.specialInput(
      initializer,
      "resource-input",
      ownerId,
      { factory: calleeName(this.ts, initializer.expression) },
      "resource-boundary",
      "A resource factory call creates an asynchronous input boundary.",
    );
    const factoryCallId = this.ensureElement(
      initializer,
      "call",
      ownerId,
      { callee: calleeName(this.ts, initializer.expression) },
      this.symbolId(initializer.expression),
      this.moduleFor(initializer.expression),
      null,
      "proven",
      proof(
        "ast-node",
        "The resource factory is a source-backed invocation occurrence.",
        [this.location(initializer)],
      ),
    );
    this.addRelation(
      factoryCallId,
      resourceId,
      "input-call",
      [this.location(initializer)],
      proof(
        "resource-boundary",
        "The resource input is the exact factory call occurrence.",
        [this.location(initializer)],
      ),
      "proven",
    );
    this.addRelation(
      resourceId,
      aliasId,
      "resource-result",
      [this.location(node)],
      proof(
        "resource-boundary",
        "The resource result is bound by the declaration pattern.",
        [this.location(node)],
      ),
      "proven",
    );
    for (const binding of bindingIdentifiers(this.ts, node.name)) {
      const symbolId = this.symbolId(binding);
      if (symbolId) this.resourceBySymbol.set(symbolId, resourceId);
    }
    const loader = initializer.arguments[1];
    this.httpResources.push({
      node: initializer,
      elementId: resourceId,
      loaderTargetId: loader ? this.functionsByNode.get(nodeKey(this.root, loader))?.id ?? null : null,
    });
    if (loader) {
      const loaderId = this.expression(loader, ownerId);
      this.addRelation(
        loaderId,
        resourceId,
        "resource-loader",
        [this.location(loader)],
        proof(
          "compiler-symbol",
          "The resource factory receives this source-backed loader expression.",
          [this.location(loader)],
        ),
        "proven",
      );
    }
  }

  protected processCall(
    node: TypeScript.CallExpression,
    ownerId: string | null,
  ): void {
    const callId = this.ensureElement(
      node,
      "call",
      ownerId,
      { callee: calleeName(this.ts, node.expression) },
      this.symbolId(node.expression),
      this.moduleFor(node.expression),
      null,
      "proven",
      proof(
        "ast-node",
        "The call expression is a source-backed invocation occurrence.",
        [this.location(node)],
      ),
    );
    const target = this.targetFunction(node.expression);
    this.calls.push({ node, id: callId, target, ownerId });
    if (target) {
      this.addRelation(
        callId,
        target.id,
        "invokes",
        [this.location(node.expression)],
        proof(
          "compiler-symbol",
          "The call target resolves to an in-project function declaration.",
          [this.location(node.expression)],
        ),
        "proven",
      );
    } else if (this.ts.isElementAccessExpression(node.expression)) {
      this.gap(
        callId,
        "forward",
        "dynamic-dispatch",
        "The computed callee cannot be compiler-resolved.",
        node.expression,
      );
    } else if (
      !this.symbolId(node.expression) &&
      !isKnownGlobal(calleeName(this.ts, node.expression))
    ) {
      this.gap(
        callId,
        "forward",
        "unresolved-symbol",
        "The callee has no compiler-resolved symbol.",
        node.expression,
      );
    }
    // Half of a state pair, resolved through the checker: a setter's argument becomes the state, and a getter's call reads it.
    // The framework's model says what the call does, so its callee is not consumed by a call with no body.
    const role = stateRoleOf(this.ts, this.checker, node.expression);
    if (role) {
      const stateId = this.stateElement(role.getter);
      if (role.role === "getter") {
        this.addRelation(stateId, callId, "references", [this.location(node)], frameworkState("The getter's call reads the state its setter writes; order and time are not proven.", this.location(node)), "partial");
      }
      // One argument is the new state (or an updater); several are a path into it and the value there, packed into the state.
      const kind = node.arguments.length === 1 ? "references" : "pack-field";
      for (const argument of role.role === "setter" ? node.arguments : []) {
        this.addRelation(this.expression(this.ts.isSpreadElement(argument) ? argument.expression : argument, ownerId), stateId, kind, [this.location(argument)], frameworkState("The setter's argument becomes the state its getter reads; order and time are not proven.", this.location(argument)), "partial");
      }
    }
    // A callee with no body to enter (a library method, a callback, an accessor) is consumed by its call, as its arguments are.
    if (!role && !target && node.expression.kind !== this.ts.SyntaxKind.SuperKeyword && node.expression.kind !== this.ts.SyntaxKind.ImportKeyword) {
      this.addRelation(
        this.expression(node.expression, ownerId),
        callId,
        "references",
        [this.location(node.expression)],
        proof(
          "ast-node",
          "The callee has no in-project body: its receiver or function value is consumed by this call.",
          [this.location(node.expression)],
        ),
        "proven",
      );
    }
    for (const argument of role ? [] : node.arguments) {
      // A spread argument passes its elements: the value is what it spreads.
      const argumentId = this.expression(this.ts.isSpreadElement(argument) ? argument.expression : argument, ownerId);
      this.addRelation(
        argumentId,
        callId,
        "argument",
        [this.location(argument)],
        proof(
          "ast-node",
          "The argument is passed at this call occurrence.",
          [this.location(argument)],
        ),
        "proven",
      );
    }
    const operation = callOperation(this.ts, this.checker, node);
    if (operation) {
      const kind: ProgramElementKind =
        operation === "validate"
          ? "validation"
          : operation === "serialize"
            ? "serialization"
            : operation === "parse"
              ? "parse"
              : operation === "selection"
                ? "selection"
                : "alias";
      const operationId = this.ensureElement(
        node,
        kind,
        ownerId,
        { operation, callee: calleeName(this.ts, node.expression) },
        this.symbolId(node.expression),
        this.moduleFor(node.expression),
        null,
        "proven",
        proof(
          "compiler-symbol",
          "The call expression is classified by its resolved operation name or host API.",
          [this.location(node)],
        ),
        operation,
      );
      this.addRelation(
        callId,
        operationId,
        "performs",
        [this.location(node)],
        proof(
          "ast-node",
          "The operation is the call occurrence itself.",
          [this.location(node)],
        ),
        "proven",
      );
    }
    this.processCallBoundary(node, callId, ownerId);
    const resourceId = this.resourceBySymbol.get(this.symbolId(node.expression) ?? "");
    if (resourceId) {
      const resultId = this.ensureElement(
        node,
        "resource-result",
        ownerId,
        { resource: resourceId },
        this.symbolId(node.expression),
        null,
        resourceId,
        "proven",
        proof(
          "resource-boundary",
          "The accessor resolves to a declared resource binding.",
          [this.location(node)],
        ),
      );
      this.addRelation(
        resourceId,
        resultId,
        "resource-result",
        [this.location(node)],
        proof(
          "resource-boundary",
          "The resource accessor returns the resource result occurrence.",
          [this.location(node)],
        ),
        "proven",
      );
      this.addRelation(
        resultId,
        callId,
        "references",
        [this.location(node)],
        proof(
          "ast-node",
          "The call reads the resource result accessor.",
          [this.location(node)],
        ),
        "proven",
      );
    }
  }

  protected processNew(
    node: TypeScript.NewExpression,
    ownerId: string | null,
  ): void {
    const evidence = constructorExpressionElementEvidence(
      this.ts,
      node,
      this.location(node),
    );
    const callId = this.ensureElement(
      node,
      "call",
      ownerId,
      evidence.attributes,
      this.symbolId(node.expression),
      this.moduleFor(node.expression),
      null,
      "proven",
      evidence.proof,
    );
    for (const argument of node.arguments ?? []) {
      this.addRelation(
        this.expression(argument, ownerId),
        callId,
        "argument",
        [this.location(argument)],
        proof(
          "ast-node",
          "The constructor argument is source-backed.",
          [this.location(argument)],
        ),
        "proven",
      );
    }
    if (calleeName(this.ts, node.expression) === "Response") {
      const responseId = this.specialInput(
        node,
        "http-response",
        ownerId,
        { constructor: "Response" },
        "host-api",
        "A Response constructor creates an HTTP response value.",
      );
      this.addRelation(
        callId,
        responseId,
        "effect-input",
        [this.location(node)],
        proof(
          "host-api",
          "The Response constructor identifies the HTTP response terminal.",
          [this.location(node)],
        ),
        "proven",
      );
    }
  }

  /**
   * A call into code with no in-project body, once every element exists. Its
   * receiver and arguments already reach its value (`processCall`); two more
   * hand-offs follow from the same fact. A collection method's result (the
   * `call-result` its field transfer names) is this call's own value. And a
   * call whose value is discarded can only leave its arguments in its
   * receiver (`rows.push(row)`, `seen.set(key, value)`): when the function
   * declares that receiver, they reach its binding. That is assumed, not
   * proven, so the relation is `partial` with an `external-call` proof.
   */
  protected connectExternalCall(call: CollectorCallInfo): void {
    const resultId = this.elementIfPresent(call.node, "call-result");
    if (resultId) {
      this.addRelation(resultId, call.id, "references", [this.location(call.node)], proof("ast-node", "The collection method's result is this call's own value.", [this.location(call.node)]), "proven");
    }
    if (!this.ts.isCallExpression(call.node)) return;
    this.connectExternalCallbacks(call, call.node);
    if (!discardsValue(this.ts, call.node)) return;
    // The receiver's root name: `rows` in `rows.push(row)`, `section` in `section.rows.push(row)`.
    let root = unwrap(this.ts, call.node.expression);
    if (!this.ts.isPropertyAccessExpression(root)) return;
    while (this.ts.isPropertyAccessExpression(root)) root = unwrap(this.ts, root.expression);
    if (!this.ts.isIdentifier(root)) return;
    // Only a variable the same function declares (`const rows = []; rows.push(row)`): shared state, a parameter or a global is written for code this function does not own.
    const declaration = this.checker.getSymbolAtLocation(root)?.valueDeclaration;
    const scope = (node: TypeScript.Node) => this.ts.findAncestor(node.parent, this.ts.isFunctionLike);
    if (!declaration || !this.ts.isVariableDeclaration(declaration) || scope(declaration) !== scope(call.node)) return;
    const bindingId = this.variablesBySymbol.get(this.symbolId(root) ?? "");
    if (!bindingId) return;
    this.addRelation(call.id, bindingId, "references", [this.location(call.node), this.location(root)], assumedProof(`Assumed: ${calleeName(this.ts, call.node.expression)} has no source to read and its value is discarded, so its arguments are kept in its receiver.`, [this.location(call.node), this.location(root)]), "partial");
  }

  /**
   * A function written as an argument to a call with no source to read
   * (`rows.find((row) => …)`, `promise.then((value) => …)`, `list.sort((a, b) => …)`)
   * is called by that call, and by nothing else in the program. Its
   * parameters receive what the call works on: its receiver's element where
   * the receiver is indexed or awaited, else the receiver, each parameter
   * only when the checker says its type accepts that value. Its returns reach
   * the call's value. Both are assumed, so both are `partial`.
   */
  private connectExternalCallbacks(call: CollectorCallInfo, node: TypeScript.CallExpression): void {
    const callee = calleeName(this.ts, node.expression);
    const calleeNode = unwrap(this.ts, node.expression);
    const receiver = this.ts.isPropertyAccessExpression(calleeNode) ? calleeNode.expression : null;
    const receiverType = receiver ? this.checker.getTypeAtLocation(receiver) : null;
    const awaited = receiverType ? this.checker.getAwaitedType(receiverType) : undefined;
    const element = receiverType ? receiverType.getNumberIndexType() ?? (awaited && awaited !== receiverType ? awaited : undefined) ?? receiverType : null;
    for (const argument of node.arguments) {
      const fn = unwrap(this.ts, argument);
      if (!this.ts.isArrowFunction(fn) && !this.ts.isFunctionExpression(fn)) continue;
      const info = this.functionsByNode.get(nodeKey(this.root, fn));
      if (!info) continue;
      const where = [this.location(fn)];
      if (receiver && element) {
        const receiverId = this.expression(receiver, call.ownerId);
        for (const parameter of fn.parameters) {
          const binding = firstBindingIdentifier(this.ts, parameter.name);
          const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
          if (!parameterId || !this.checker.isTypeAssignableTo(element, this.checker.getTypeAtLocation(parameter))) continue;
          this.addRelation(receiverId, parameterId, "callback-parameter", [this.location(receiver), this.location(parameter)], assumedProof(`Assumed: ${callee} has no source to read, so it is taken to call this function with ${receiver.getText()}${element === receiverType ? "" : "'s elements"}.`, [this.location(receiver), this.location(parameter)]), "partial");
        }
      }
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) {
        this.addRelation(returnId, call.id, "return-value", where, assumedProof(`Assumed: ${callee} has no source to read, so its value is taken to derive from what this function returns.`, where), "partial");
      }
    }
  }

  protected processCallBoundary(
    node: TypeScript.CallExpression,
    callId: string,
    ownerId: string | null,
  ): void {
    processProgramCallBoundary({
      ts: this.ts,
      checker: this.checker,
      node,
      callId,
      ownerId,
      location: (value) => this.location(value),
      moduleFor: (value) => this.moduleFor(value),
      isExternalCall: (value) => this.isExternalCall(value),
      specialInput: (...args) => this.specialInput(...args),
      effect: (effectNode, effectCallId, effectOwnerId, effectKind, detail, proofKind = "host-api") => {
        const effectId = this.specialInput(
          effectNode,
          "external-effect",
          effectOwnerId,
          { effectKind },
          proofKind,
          detail,
        );
        this.addRelation(
          effectCallId,
          effectId,
          "effect-input",
          [this.location(effectNode)],
          proof(proofKind, detail, [this.location(effectNode)]),
          "proven",
        );
      },
      addRelation: (...args) => this.addRelation(...args),
      expression: (value, valueOwnerId) => this.expression(value, valueOwnerId),
      gap: (...args) => this.gap(...args),
      addHttpFetch: (fetch) => this.httpFetches.push(fetch),
      addHttpResponse: (response) => this.httpResponses.push(response),
    });
  }

  /** The state element of a reactive pair, at its getter's binding. */
  protected stateElement(getter: TypeScript.Identifier): string {
    const fn = this.ts.findAncestor(getter, (item) => this.ts.isFunctionLike(item));
    return this.ensureElement(
      getter,
      "alias",
      fn ? this.functionsByNode.get(nodeKey(this.root, fn))?.id ?? null : null,
      { name: getter.text, state: true },
      this.symbolId(getter),
      null,
      null,
      "partial",
      frameworkState("The state a reactive pair holds: what its setter receives, its getter reads.", this.location(getter)),
    );
  }

  /**
   * The receiver binding of a function that reads `this`: what `this` is at
   * each method call, bound from the call's receiver like a parameter.
   */
  protected thisBinding(fn: TypeScript.Node): string | null {
    const info = this.functionsByNode.get(nodeKey(this.root, fn));
    if (!info || !readsThis(this.ts, fn)) return null;
    return this.ensureElement(
      fn,
      "parameter",
      info.id,
      { name: "this" },
      null,
      null,
      null,
      "proven",
      proof("ast-node", "The function's receiver: what `this` is at each method call.", [this.location(fn)]),
    );
  }

  protected expression(
    node: TypeScript.Expression,
    ownerId: string | null,
  ): string {
    const unwrapped = unwrap(this.ts, node);
    if (unwrapped.kind === this.ts.SyntaxKind.ThisKeyword) {
      // `this` reads the receiver its function was called on.
      const id = this.ensureElement(unwrapped, "value", ownerId, { name: "this" }, null, null, null, "proven", proof("ast-node", "`this` reads the function's receiver.", [this.location(unwrapped)]));
      const container = thisContainer(this.ts, unwrapped);
      const binding = container ? this.thisBinding(container) : null;
      if (binding) {
        this.addRelation(binding, id, "references", [this.location(unwrapped)], proof("ast-node", "`this` reads the function's receiver.", [this.location(unwrapped)]), "proven");
      }
      return id;
    }
    return collectProgramEvidenceExpression(
      {
        ts: this.ts,
        references: this.references,
        parametersBySymbol: this.parametersBySymbol,
        functionsBySymbol: this.functionsBySymbol,
        symbolId: (value) => this.symbolId(value),
        moduleFor: (value) => this.moduleFor(value),
        location: (value) => this.location(value),
        ensureElement: (...args) => this.ensureElement(...args),
        addRelation: (...args) => this.addRelation(...args),
      },
      node,
      ownerId,
    );
  }
}
