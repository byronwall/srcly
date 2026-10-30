import * as TypeScript from "typescript";
import type { ProgramElementKind, ProgramEvidenceLocation } from "./program-evidence";
import { processProgramCallBoundary } from "./program-evidence-boundary-support";
import {
  collectProgramEvidenceExpression,
  constructorExpressionElementEvidence,
} from "./program-evidence-collector-expression-support";
import { lazyFactoryGetter, reducerOf, stateFactory, stateRoleOf } from "./program-evidence-state-pairs";
import { namesSeveralValues, resolveValue, wrappedArgument } from "./value-origin";
import { frameworkFlow, makesAccessor } from "./framework-flows";
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
  discardsValue,
  importedCallee,
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
    this.bindResourceSource(initializer.arguments[0], loader, ownerId);
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

  /**
   * `createResource(source, fetcher)` calls the fetcher with the source's
   * value: an arrow's returned expression, or the accessor it is given.
   */
  private bindResourceSource(source: TypeScript.Expression | undefined, loader: TypeScript.Expression | undefined, ownerId: string | null): void {
    const fetcher = loader ? unwrap(this.ts, loader) : null;
    if (!source || !fetcher || !(this.ts.isArrowFunction(fetcher) || this.ts.isFunctionExpression(fetcher))) return;
    const parameter = fetcher.parameters[0];
    if (!parameter || !this.ts.isIdentifier(parameter.name)) return;
    const parameterId = this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "");
    const value = unwrap(this.ts, source);
    const returned = this.ts.isArrowFunction(value) && !this.ts.isBlock(value.body) ? value.body : value;
    if (!parameterId || !this.ts.isExpression(returned)) return;
    this.addRelation(
      this.expression(returned, ownerId),
      parameterId,
      "resource-source-parameter",
      [this.location(source), this.location(parameter)],
      proof("resource-boundary", "The resource calls its fetcher with the source's value.", [this.location(source), this.location(parameter)]),
      "proven",
    );
  }

  /** The values a framework call moves (its row, `frameworkFlow`), and an accessor call of a value one made. */
  private connectFrameworkFlow(node: TypeScript.CallExpression, callId: string, ownerId: string | null): void {
    const relate = (from: TypeScript.Expression, to: string, detail: string) => this.addRelation(
      this.expression(from, ownerId), to, "framework-flow", [this.location(from)], frameworkState(detail, this.location(node)), "proven",
    );
    const accessor = this.ts.isIdentifier(node.expression) ? resolveValue(this.ts, this.checker, node.expression)?.origin : null;
    if (accessor && this.ts.isCallExpression(accessor)) {
      const made = importedCallee(this.ts, this.checker, accessor.expression);
      const holderId = made && makesAccessor(made.module, made.name) ? this.variablesBySymbol.get(this.symbolId(node.expression) ?? "") : undefined;
      if (holderId) this.addRelation(holderId, callId, "accessor-call", [this.location(node)], frameworkState("Calling the accessor yields the value its factory computes.", this.location(node)), "proven");
    }
    const imported = importedCallee(this.ts, this.checker, node.expression);
    const flow = imported ? frameworkFlow(imported.module, imported.name) : undefined;
    if (!flow) return;
    const argument = (index: number) => (node.arguments[index] ? unwrap(this.ts, node.arguments[index]) : undefined);
    const passed = flow.passes === "*" ? node.arguments.map((_, index) => index) : flow.passes ?? [];
    for (const index of passed) {
      const value = argument(index);
      if (value) relate(value, callId, "The framework call yields a value carrying this argument.");
    }
    // A source that is a value, not a function (`on(count, …)`): what it is reaches the callback now; a function's returns reach it after collection.
    const source = flow.source !== undefined ? argument(flow.source) : undefined;
    const parameterId = flow.callback !== undefined ? this.firstParameterId(argument(flow.callback)) : undefined;
    if (source && parameterId && !this.ts.isArrowFunction(source) && !this.ts.isFunctionExpression(source)) relate(source, parameterId, "The framework calls the callback with the source's value.");
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
    // `super(name)` runs the base class's constructor.
    const target = this.targetFunction(node.expression) ?? (node.expression.kind === this.ts.SyntaxKind.SuperKeyword ? this.constructorTarget(node) : null);
    this.calls.push({ node, id: callId, target, ownerId });
    this.connectFrameworkFlow(node, callId, ownerId);
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
    } else if (namesSeveralValues(this.ts, this.checker, node.expression)) {
      this.gap(callId, "forward", "dynamic-dispatch", "The callee is one of several in-project values (a union): the call is not paired with one.", node.expression);
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
      // A reducer's dispatch hands its action to the reducer, whose return (`frameworkFlow`) is the new state.
      const reducer = role.role === "setter" ? reducerOf(this.ts, this.checker, role.getter) : null;
      const action = reducer ? this.targetFunction(unwrap(this.ts, reducer))?.declaration.parameters[1] : undefined;
      const actionId = action && this.ts.isIdentifier(action.name) ? this.parametersBySymbol.get(this.symbolId(action.name) ?? "") : undefined;
      if (actionId && node.arguments[0]) {
        this.addRelation(this.expression(node.arguments[0], ownerId), actionId, "framework-flow", [this.location(node.arguments[0]), this.location(action!)], frameworkState("The dispatch calls the reducer with this action.", this.location(node)), "proven");
      }
      // One argument is the new state (or an updater); several are a path into it and the value there, packed into the state.
      const kind = node.arguments.length === 1 ? "references" : "pack-field";
      for (const argument of role.role === "setter" && !actionId ? node.arguments : []) {
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
    // `new Named(name)` runs the class's constructor: its arguments bind the constructor's parameters (`connectCalls`).
    const target = this.constructorTarget(node);
    // A library constructor (`new Promise(…)`) is connected once every element exists too (`connectExternalCall`).
    this.calls.push({ node, id: callId, target, ownerId });
    if (target) {
      this.addRelation(callId, target.id, "invokes", [this.location(node.expression)], proof("compiler-symbol", "The constructor call resolves to an in-project constructor.", [this.location(node.expression)]), "proven");
    }
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
    if (this.ts.isCallExpression(call.node) || this.ts.isNewExpression(call.node)) this.connectSuppliedCallbacks(call, call.node);
    if (!this.ts.isCallExpression(call.node)) return;
    const stateFunctions = this.connectStateFunctions(call.node);
    this.connectExternalCallbacks(call, call.node, stateFunctions);
    if (!discardsValue(this.ts, call.node, this.checker)) return;
    const method = unwrap(this.ts, call.node.expression);
    // A function held in a field (`props.onPick(label)`) is called, not its object changed: only a method keeps its arguments in its receiver.
    const member = this.ts.isPropertyAccessExpression(method) ? this.checker.getSymbolAtLocation(method.name)?.declarations?.[0] : undefined;
    if (member && (this.ts.isPropertySignature(member) || this.ts.isPropertyDeclaration(member) || this.ts.isPropertyAssignment(member))) return;
    // A member the project declares keeps what is put into it (`this.items.set(key, value)`): its reads see it.
    const receiver = this.ts.isPropertyAccessExpression(method) ? unwrap(this.ts, method.expression) : null;
    if (receiver && this.ts.isPropertyAccessExpression(receiver)) this.addMemberWrite(receiver, call.id);
    // The receiver's root name: `rows` in `rows.push(row)`, `section` in `section.rows.push(row)`, `groups` in `groups[key].push(row)`.
    let root = unwrap(this.ts, call.node.expression);
    if (!this.ts.isPropertyAccessExpression(root)) return;
    root = unwrap(this.ts, root.expression);
    // The fields from the root to the receiver (`rows` in `section.rows`), innermost first; an index on the way writes the whole value from there.
    let fields: TypeScript.PropertyAccessExpression[] = [];
    while (this.ts.isPropertyAccessExpression(root) || this.ts.isElementAccessExpression(root)) {
      fields = this.ts.isPropertyAccessExpression(root) ? [...fields, root] : [];
      root = unwrap(this.ts, root.expression);
    }
    if (!this.ts.isIdentifier(root)) return;
    // A variable a function declares, this one or one it is written in (a closure's), or a parameter: what it keeps, its reads see.
    // A module's own container is kept into only when its file reads it back (`cache.set(k, v)` and `cache.get(k)`); one only
    // written to (a log) stops here, and module state shared across files and globals are written for code no one function owns.
    const declaration = this.checker.getSymbolAtLocation(root)?.valueDeclaration;
    const local = declaration && this.ts.isVariableDeclaration(declaration) && this.ts.findAncestor(declaration.parent, this.ts.isFunctionLike);
    if (!local && !(declaration && this.ts.isParameter(declaration)) && !(declaration && this.ts.isVariableDeclaration(declaration) && this.readBackInFile(declaration))) return;
    const bindingId = this.variablesBySymbol.get(this.symbolId(root) ?? "") ?? this.parametersBySymbol.get(this.symbolId(root) ?? "");
    if (!bindingId) return;
    const [kept, keptStatus] = this.libraryProof(call.node, `${calleeName(this.ts, call.node.expression)}'s value is discarded, so its arguments are kept in its receiver.`, [this.location(call.node), this.location(root)]);
    if (fields.length === 0) {
      this.addRelation(call.id, bindingId, "references", [this.location(call.node), this.location(root)], kept, keptStatus);
      return;
    }
    // Packed field by field into the root (`section.rows.push(row)` packs into `rows` of `section`), as `section.rows = …` would.
    let valueId = call.id;
    fields.forEach((access, index) => {
      const { span } = this.location(access.name);
      const packId = this.ensureElement(access, "object-pack", call.ownerId, { operation: "object-pack", fields: JSON.stringify({ [`${span.startLine}:${span.startColumn}`]: access.name.text }) }, null, null, null, "proven", proof("ast-node", "The receiver is one field of the object it is read from.", [this.location(access)]));
      const [packProof, packStatus] = index === 0 ? [kept, keptStatus] : [proof("ast-node", "The field holds the value written into it.", [this.location(access.name)]), "proven" as const];
      this.addRelation(valueId, packId, "pack-field", [this.location(access.name)], { ...packProof, locations: [this.location(access.name), ...packProof.locations] }, packStatus);
      valueId = packId;
    });
    this.addRelation(valueId, bindingId, "references", [this.location(root)], proof("ast-node", "The object the call writes a field of.", [this.location(root)]), "proven");
  }

  /**
   * A function written as an argument to library code may be handed a
   * function of the library's own (`new Promise((resolve) => …)`): calling it
   * (`resolve(value)`) hands the value back to the library call that supplied
   * it, so the value reaches that call's own value. Proven for the standard
   * library, assumed for a package.
   */
  private connectSuppliedCallbacks(call: CollectorCallInfo, node: TypeScript.CallExpression | TypeScript.NewExpression): void {
    for (const argument of node.arguments ?? []) {
      const fn = unwrap(this.ts, argument);
      if (!this.ts.isArrowFunction(fn) && !this.ts.isFunctionExpression(fn)) continue;
      const info = this.functionsByNode.get(nodeKey(this.root, fn));
      const supplied = new Set(fn.parameters.flatMap((parameter) => {
        const symbol = this.ts.isIdentifier(parameter.name) ? this.checker.getSymbolAtLocation(parameter.name) : undefined;
        return symbol && this.checker.getTypeAtLocation(parameter).getCallSignatures().length > 0 ? [symbol] : [];
      }));
      if (!info || supplied.size === 0) continue;
      const visit = (inner: TypeScript.Node) => {
        if (this.ts.isCallExpression(inner) && this.ts.isIdentifier(inner.expression) && supplied.has(this.checker.getSymbolAtLocation(inner.expression)!) && inner.arguments[0]) {
          const where = [this.location(inner.arguments[0]), this.location(node)];
          const [handed, handedStatus] = this.libraryProof(node, `${inner.expression.text} hands its argument back to the call that supplied it.`, where);
          this.addRelation(this.expression(inner.arguments[0], info.id), call.id, "return-value", where, handed, handedStatus);
        }
        this.ts.forEachChild(inner, visit);
      };
      visit(fn.body);
    }
  }

  /**
   * Whether a module's own variable (unexported) is read in its file other
   * than as the receiver of a call whose value is dropped: `cache.get(key)`
   * reads the container back, `log.push(entry);` only writes into it.
   */
  private readBackInFile(declaration: TypeScript.VariableDeclaration): boolean {
    const statement = declaration.parent?.parent;
    if (!this.ts.isIdentifier(declaration.name) || !statement || !this.ts.isVariableStatement(statement) || !this.ts.isSourceFile(statement.parent)) return false;
    if (statement.modifiers?.some((modifier) => modifier.kind === this.ts.SyntaxKind.ExportKeyword)) return false;
    const symbol = this.checker.getSymbolAtLocation(declaration.name);
    let found = false;
    const visit = (node: TypeScript.Node) => {
      if (found) return;
      if (this.ts.isIdentifier(node) && node !== declaration.name && this.checker.getSymbolAtLocation(node) === symbol) {
        const access = node.parent;
        const call = this.ts.isPropertyAccessExpression(access) && access.expression === node && this.ts.isCallExpression(access.parent) && access.parent.expression === access ? access.parent : null;
        if (!call || !discardsValue(this.ts, call, this.checker)) found = true;
      }
      this.ts.forEachChild(node, visit);
    };
    visit(statement.parent);
    return found;
  }

  /**
   * A function handed to a state pair where a value goes stands for what it
   * returns: a setter's updater (`setCount((c) => c + step)`, a store path's
   * `setState("todos", (list) => [...list, item])`) and a lazy initial value
   * (`useState(() => compute(seed))`). Its returns become the state, and an
   * updater's parameter receives the current state.
   */
  private connectStateFunctions(node: TypeScript.CallExpression): Set<TypeScript.Node> {
    const handled = new Set<TypeScript.Node>();
    const role = stateRoleOf(this.ts, this.checker, node.expression);
    const getter = role?.role === "setter" ? role.getter : lazyFactoryGetter(this.ts, this.checker, node);
    if (!getter) return handled;
    const stateId = this.stateElement(getter);
    for (const argument of node.arguments) {
      const fn = unwrap(this.ts, argument);
      if (!this.ts.isArrowFunction(fn) && !this.ts.isFunctionExpression(fn)) continue;
      const info = this.functionsByNode.get(nodeKey(this.root, fn));
      if (!info) continue;
      handled.add(fn);
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) {
        this.addRelation(returnId, stateId, "framework-flow", [this.location(fn)], frameworkState("The function's return becomes the state its getter reads; order and time are not proven.", this.location(fn)), "partial");
      }
      const parameterId = role ? this.firstParameterId(fn) : undefined;
      if (parameterId) this.addRelation(stateId, parameterId, "references", [this.location(fn)], frameworkState("The updater receives the current state.", this.location(fn)), "partial");
    }
    return handled;
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
  private connectExternalCallbacks(call: CollectorCallInfo, node: TypeScript.CallExpression, stateFunctions: ReadonlySet<TypeScript.Node>): void {
    // A framework call whose flow a row models (`frameworkFlow`) needs no assumption.
    const imported = importedCallee(this.ts, this.checker, node.expression);
    const flow = imported ? frameworkFlow(imported.module, imported.name) : undefined;
    if (flow) {
      // What a function argument returns goes where the flow says: the call's value, or the callback's parameter.
      const returnsOf = (index: number | undefined) => {
        const fn = index !== undefined && node.arguments[index] ? unwrap(this.ts, node.arguments[index]) : undefined;
        const info = fn ? this.functionsByNode.get(nodeKey(this.root, fn)) ?? this.targetFunction(fn) ?? undefined : undefined;
        return { fn, ids: info ? this.returnsByFunction.get(info.id) ?? [] : [] };
      };
      const result = returnsOf(flow.returns);
      for (const returnId of result.ids) {
        this.addRelation(returnId, call.id, "framework-flow", [this.location(result.fn!)], frameworkState("The framework call yields what its callback returns.", this.location(node)), "proven");
      }
      const source = returnsOf(flow.source);
      const parameterId = flow.callback !== undefined ? this.firstParameterId(node.arguments[flow.callback] && unwrap(this.ts, node.arguments[flow.callback])) : undefined;
      for (const returnId of parameterId ? source.ids : []) {
        this.addRelation(returnId, parameterId!, "framework-flow", [this.location(source.fn!)], frameworkState("The framework calls the callback with what the source returns.", this.location(node)), "proven");
      }
      return;
    }
    const callee = calleeName(this.ts, node.expression);
    const calleeNode = unwrap(this.ts, node.expression);
    const receiver = this.ts.isPropertyAccessExpression(calleeNode) ? calleeNode.expression : null;
    const receiverType = receiver ? this.checker.getTypeAtLocation(receiver) : null;
    const awaited = receiverType ? this.checker.getAwaitedType(receiverType) : undefined;
    const element = receiverType ? receiverType.getNumberIndexType() ?? (awaited && awaited !== receiverType ? awaited : undefined) ?? receiverType : null;
    // A wrapper (`action(fn)`, `useCallback(fn)`) returns the function itself: what it returns reaches the wrapper's call sites, not this call.
    const wrapped = wrappedArgument(this.ts, this.checker, node);
    for (const argument of node.arguments) {
      const fn = unwrap(this.ts, argument);
      if ((!this.ts.isArrowFunction(fn) && !this.ts.isFunctionExpression(fn)) || stateFunctions.has(fn)) continue;
      const info = this.functionsByNode.get(nodeKey(this.root, fn));
      if (!info) continue;
      const where = [this.location(fn)];
      if (fn === wrapped) continue;
      if (receiver && element) {
        const receiverId = this.expression(receiver, call.ownerId);
        for (const parameter of fn.parameters) {
          const binding = firstBindingIdentifier(this.ts, parameter.name);
          const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
          if (!parameterId || !this.checker.isTypeAssignableTo(element, this.checker.getTypeAtLocation(parameter))) continue;
          const [called, calledStatus] = this.libraryProof(node, `${callee} calls this function with ${receiver.getText()}${element === receiverType ? "" : "'s elements"}.`, [this.location(receiver), this.location(parameter)]);
          this.addRelation(receiverId, parameterId, "callback-parameter", [this.location(receiver), this.location(parameter)], called, calledStatus);
        }
      }
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) {
        const [derived, derivedStatus] = this.libraryProof(node, `${callee}'s value derives from what this function returns.`, where);
        this.addRelation(returnId, call.id, "return-value", where, derived, derivedStatus);
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
      model: this.modelFor(node.expression),
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
        readsNamespace: (value) => this.ts.isIdentifier(value.expression) && Boolean(this.checker.getSymbolAtLocation(value.expression)?.declarations?.some((item) => this.ts.isNamespaceImport(item))),
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

