import * as TypeScript from "typescript";
import type { ProgramElementKind } from "./program-evidence";
import { processProgramCallBoundary } from "./program-evidence-boundary-support";
import {
  collectProgramEvidenceExpression,
  constructorExpressionElementEvidence,
} from "./program-evidence-collector-expression-support";
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
  proof,
  discardsValue,
  unwrap,
} from "./program-evidence-support";

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
    if (initializerId) {
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
    // A callee with no body to enter (a library method, a callback, an accessor) is consumed by its call, as its arguments are.
    if (!target && node.expression.kind !== this.ts.SyntaxKind.SuperKeyword && node.expression.kind !== this.ts.SyntaxKind.ImportKeyword) {
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
    for (const argument of node.arguments) {
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
    if (!this.ts.isCallExpression(call.node) || !discardsValue(this.ts, call.node)) return;
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
    this.addRelation(call.id, bindingId, "references", [this.location(call.node), this.location(root)], proof("external-call", `Assumed: ${calleeName(this.ts, call.node.expression)} has no source to read and its value is discarded, so its arguments are kept in its receiver.`, [this.location(call.node), this.location(root)]), "partial");
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
      effect: (effectNode, effectCallId, effectOwnerId, effectKind, detail) => {
        const effectId = this.specialInput(
          effectNode,
          "external-effect",
          effectOwnerId,
          { effectKind },
          "host-api",
          detail,
        );
        this.addRelation(
          effectCallId,
          effectId,
          "effect-input",
          [this.location(effectNode)],
          proof("host-api", detail, [this.location(effectNode)]),
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

  protected expression(
    node: TypeScript.Expression,
    ownerId: string | null,
  ): string {
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
