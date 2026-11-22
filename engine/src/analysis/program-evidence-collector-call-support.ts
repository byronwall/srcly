import * as TypeScript from "typescript";
import { storeMember, writesStore } from "./zustand-store";
import type { ProgramElementKind, ProgramEvidenceLocation } from "./program-evidence";
import { processProgramCallBoundary } from "./program-evidence-boundary-support";
import {
  collectProgramEvidenceExpression,
  constructorExpressionElementEvidence,
  type ProgramEvidenceExpressionContext,
} from "./program-evidence-collector-expression-support";
import { lazyFactoryGetter, reducerOf, seedArgument, stateFactory, stateRoleOf } from "./program-evidence-state-pairs";
import { jsonValueMember, namesSeveralValues, resolveValue, throughWrappers, wrappedArgument } from "./value-origin";
import { frameworkFlow, frameworkRow, makesAccessor, makesPredicate, primaryOption, promiseChannels, reducerArgument, rowFlow, rowPaths, standardCallback, watchedFunction, yieldsOnlyCallback, type Flow, type FrameworkFlow } from "./framework-flows";
import { boundaryRole, builtinLibraryModels, standardMemberModel, type LibraryModelRow } from "./library-models";
import { locationKey } from "./program-value-summary-support";
import { ProgramEvidenceCollectorDeclarations } from "./program-evidence-collector-declarations";
import type { CollectorCallInfo, CollectorFunctionInfo } from "./program-evidence-collector-support";
import {
  bindingIdentifiers,
  browserMember,
  calleeName,
  callOperation,
  firstBindingIdentifier,
  isKnownGlobal,
  isResourceFactory,
  nodeKey,
  readsThis,
  resourceAction,
  resourceFlow,
  thisContainer,
  proof,
  discardsValue,
  importedCallee,
  unwrap,
} from "./program-evidence-support";


const num = (pattern: RegExp, text: string) => {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : undefined;
};

function frameworkState(detail: string, location: ProgramEvidenceLocation) {
  return proof("framework-state", detail, [location]);
}

export class ProgramEvidenceCollectorCallSupport extends ProgramEvidenceCollectorDeclarations {
  private readonly expressionContext: ProgramEvidenceExpressionContext = {
    ts: this.ts,
    addReference: (reference) => this.addReference(reference),
    parametersBySymbol: this.parametersBySymbol,
    functionsBySymbol: this.functionsBySymbol,
    symbolId: (value) => this.symbolId(value),
    readsNamespace: (value) => this.ts.isIdentifier(value.expression) && Boolean(this.checker.getSymbolAtLocation(value.expression)?.declarations?.some((item) => this.ts.isNamespaceImport(item))),
    moduleFor: (value) => this.moduleFor(value),
    location: (value) => this.location(value),
    ensureElement: (...args) => this.ensureElement(...args),
    addRelation: (...args) => this.addRelation(...args),
  };
  protected processVariable(
    node: TypeScript.VariableDeclaration,
    ownerId: string | null,
  ): void {
    const initializer = node.initializer;
    if (!initializer) return;
    const aliasId = this.variableId(node) ?? this.elementFor(node, "alias");
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
      // An initial value taken as it is seeds the state whole, field by field, not through the call (`seedArgument`).
      const seed = this.ts.isCallExpression(initializer) ? seedArgument(this.ts, this.checker, initializer) : null;
      if (seed) this.addRelation(this.expression(seed, ownerId), stateId, "references", [this.location(seed)], frameworkState("The factory's initial value seeds the state its getter reads.", this.location(seed)), "partial");
    }
    // A state pair's `[getter, setter]` binds two functions, not the value: the value goes through the state.
    // A call with no value binds nothing.
    if (initializerId && !getter && !(this.ts.isCallExpression(initializer) && this.callHasNoValue(initializer))) {
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
    const loader = initializer.arguments[resourceFlow(this.ts, this.checker, initializer).returns!];
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

  /** How a framework call moves values: its row, or for a resource the overload this call uses. */
  private flowOf(node: TypeScript.CallExpression): FrameworkFlow | undefined {
    if (isResourceFactory(this.ts, this.checker, node)) return resourceFlow(this.ts, this.checker, node);
    const imported = importedCallee(this.ts, this.checker, node.expression);
    if (imported) return frameworkFlow(imported.module, imported.name);
    // A standard-library member's row (`Object.assign` passes its objects through, a field staying that field).
    const row = standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, node.expression));
    return row?.model === "passes-through" ? rowFlow(row) : undefined;
  }

  private watchesFunction(node: TypeScript.CallExpression): boolean {
    const imported = importedCallee(this.ts, this.checker, node.expression);
    return imported !== null && watchedFunction(imported.module, imported.name) !== null;
  }

  /** Whether a row names where the call's value comes from (`useMemo`'s callback, `useQuery`'s `queryFn`), so no other argument is in it. */
  private yieldsOnlyItsCallback(node: TypeScript.CallExpression): boolean {
    const imported = importedCallee(this.ts, this.checker, node.expression);
    return imported !== null && yieldsOnlyCallback(imported.module, imported.name);
  }

  /** The values a framework call moves (its paths, `connectCallPaths`), and an accessor call of a value one made. */
  private connectFrameworkFlow(node: TypeScript.CallExpression, callId: string, ownerId: string | null): void {
    const accessor = this.ts.isIdentifier(node.expression) ? resolveValue(this.ts, this.checker, node.expression)?.origin : null;
    if (accessor && this.ts.isCallExpression(accessor)) {
      const made = importedCallee(this.ts, this.checker, accessor.expression);
      const holderId = made && makesAccessor(made.module, made.name) ? this.variablesBySymbol.get(this.symbolId(node.expression) ?? "") : undefined;
      const predicate = made && makesPredicate(made.module, made.name);
      if (holderId) this.addRelation(holderId, callId, "accessor-call", [this.location(node)], frameworkState(predicate ? "Calling the selector tests its key against the source: a boolean, not the source's value." : "Calling the accessor yields the value its factory computes.", this.location(node)), "proven");
    }
    this.connectCallPaths("collect", node, callId, ownerId);
  }

  /**
   * The access paths a call follows: its row's (`rowPaths`), a resource's
   * overload (`resourceFlow`), or a reducer pair's reducer, whose return is
   * the state. A member row counts only for `passes-through` and a promise's
   * channels; a standard callback is `connectStandardCallback`'s.
   */
  private callPaths(node: TypeScript.CallExpression): { row: LibraryModelRow | null; flows: Flow[] } | null {
    const path = (from: string, to: string): Flow => ({ from, to, test: false });
    if (isResourceFactory(this.ts, this.checker, node)) {
      const flow = resourceFlow(this.ts, this.checker, node);
      return { row: null, flows: [...(flow.source !== undefined ? [path(`Argument[${flow.source}].ReturnValue`, `Argument[${flow.callback}].Parameter[0]`)] : []), path(`Argument[${flow.returns}].ReturnValue`, "ReturnValue")] };
    }
    const imported = importedCallee(this.ts, this.checker, node.expression);
    if (imported) {
      const row = frameworkRow(imported.module, imported.name);
      const reducer = reducerArgument(imported.module, imported.name);
      return row && { row, flows: reducer !== null ? [path(`Argument[${reducer}].ReturnValue`, "ReturnValue")] : rowPaths(row) };
    }
    const row = standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, node.expression));
    return row && (row.model === "passes-through" || promiseChannels(row)) ? { row, flows: rowPaths(row) } : null;
  }

  /**
   * What a call's access paths (`callPaths`) move. `collect` runs while the
   * walk visits the call: a plain argument that reaches the call's value
   * (`splitProps(props)`, `Object.assign`), and a source that is a value, not
   * a function, reaching a callback (`on(count, …)`). `connect` runs once
   * every function's returns are known: what a callback returns, what a
   * source function returns, a data hook's option functions, and a promise's
   * channels. Other rules read the paths this skips: a wrapper's own function
   * (`wrappedPosition`), a watched function's fields
   * (`connectWatchedFunctions`), and `mutate`'s argument (`mutationFunction`).
   */
  private connectCallPaths(phase: "collect" | "connect", node: TypeScript.CallExpression, callId: string, ownerId: string | null): void {
    const paths = this.callPaths(node);
    if (!paths) return;
    const { row, flows } = paths;
    const relate = (fromId: string, to: string, where: TypeScript.Node, detail: string) => this.addRelation(fromId, to, "framework-flow", [this.location(where)], frameworkState(detail, this.location(node)), "proven");
    const argument = (index: number) => (node.arguments[index] ? unwrap(this.ts, node.arguments[index]) : undefined);
    // A function argument's returns, through any wrapper (`createMemo(on(source, fn))`).
    const returnsAt = (index: number) => {
      const fn = argument(index) && throughWrappers(this.ts, this.checker, argument(index)!);
      const info = fn ? this.functionsByNode.get(nodeKey(this.root, fn)) ?? this.targetFunction(fn) ?? undefined : undefined;
      return { fn, ids: info ? this.returnsByFunction.get(info.id) ?? [] : [] };
    };
    const wraps = row?.model === "wraps";
    if (promiseChannels(row)) {
      if (phase === "connect") this.connectPromisePaths(node, callId, ownerId, flows);
      return;
    }
    const option = primaryOption(row);
    if (option) {
      if (phase === "connect") this.connectOptionPaths(node, callId, ownerId, option, flows);
      return;
    }
    for (const { from, to, test } of flows) {
      const passed = /^Argument\[(\d+)(\.\.)?\]$/.exec(from);
      const source = /^Argument\[(\d+)\]\.ReturnValue(\.ArrayElement)?$/.exec(from);
      const callback = num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, to);
      // A wrapper's value is its function (`wrappedPosition`), read through the binding, never a relation.
      if (wraps && to.startsWith("ReturnValue")) continue;
      if (phase === "collect" && passed && to === "ReturnValue") {
        const start = Number(passed[1]);
        for (const [index, value] of node.arguments.entries()) {
          if (index === start || (passed[2] && index > start)) relate(this.expression(unwrap(this.ts, value), ownerId), callId, unwrap(this.ts, value), "The framework call yields a value carrying this argument.");
        }
      }
      if (source && callback !== undefined && Number(source[1]) !== callback) {
        const parameterId = this.firstParameterId(argument(callback));
        if (!parameterId) continue;
        const value = argument(Number(source[1]));
        if (phase === "collect") {
          // A source that is a value, not a function (`on(count, …)`): what it is reaches the callback now; a function's returns reach it after collection.
          if (value && !this.ts.isArrowFunction(value) && !this.ts.isFunctionExpression(value)) relate(this.expression(value, ownerId), parameterId, value, "The framework calls the callback with the source's value.");
          this.connectItemAccessor(node, callback, parameterId);
          continue;
        }
        const returns = returnsAt(Number(source[1]));
        for (const returnId of returns.ids) relate(returnId, parameterId, returns.fn!, "The framework calls the callback with what the source returns.");
      }
      if (phase === "connect" && source && !source[2] && /^ReturnValue(\.ReturnValue)?$/.test(to)) {
        const returns = returnsAt(Number(source[1]));
        for (const returnId of returns.ids) relate(returnId, callId, returns.fn!, test ? "The framework call tests keys against what its callback returns." : "The framework call yields what its callback returns.");
      }
    }
  }

  /**
   * A data hook's option paths (`Argument[0].Member[key]`). The option
   * function's return is the call's value, or one field of it (`data`): a
   * pack of that field, so the result's other fields hold none of it. A
   * function that takes it and fills the same field (`select`) replaces it
   * when the code gives one. A function it hands an object to gets fields
   * from other options (`queryKey`), and an observer (`onSuccess`) takes the
   * option function's return, its input, or another option's return.
   * Nothing moves when the code gives no option function.
   */
  private connectOptionPaths(node: TypeScript.CallExpression, callId: string, ownerId: string | null, option: string, flows: Flow[]): void {
    const fn = this.optionFunction(node, option);
    if (!fn) return;
    const where = [this.location(node)];
    const key = (path: string, rest: string) => new RegExp(`^Argument\\[0\\]\\.Member\\[(\\w+)\\]${rest}$`).exec(path)?.[1];
    const returnsOf = (name: string) => {
      const info = this.optionFunction(node, name);
      return info ? this.returnsByFunction.get(info.id) ?? [] : [];
    };
    // A parameter written as one name holds the whole value. A destructured one holds fields, so only a handed field binds it, by the field's own name.
    const parameterId = (info: CollectorFunctionInfo, index: number, field?: string) => {
      const name = info.declaration.parameters[index]?.name;
      const binding = !name || this.ts.isIdentifier(name) ? name : field && this.ts.isObjectBindingPattern(name) ? name.elements.find((item) => (item.propertyName ?? item.name).getText() === field && !item.dotDotDotToken)?.name : undefined;
      return binding && this.ts.isIdentifier(binding) ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
    };
    // A function that maps the option's return into a result field (`select`): its first parameter, by its first binding.
    const fills = (name: string) => flows.some((flow) => flow.from === `Argument[0].Member[${name}].ReturnValue` && flow.to.startsWith("ReturnValue.Member["));
    const mapperParameter = (name: string) => {
      const mapper = this.optionFunction(node, name);
      const binding = mapper?.declaration.parameters[0] && firstBindingIdentifier(this.ts, mapper.declaration.parameters[0].name);
      const id = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
      return mapper && id ? { mapper, id } : null;
    };
    for (const { from, to } of flows) {
      const returner = key(from, "\\.ReturnValue");
      const input = key(from, "\\.Parameter\\[0\\]");
      const filler = key(from, "");
      const field = /^ReturnValue\.Member\[(\w+)\]$/.exec(to)?.[1];
      const called = /^Argument\[0\]\.Member\[(\w+)\]\.Parameter\[(\d+)\]$/.exec(to);
      const handed = new RegExp(`^Argument\\[0\\]\\.Member\\[${option}\\]\\.Parameter\\[0\\]\\.Member\\[(\\w+)\\]$`).exec(to)?.[1];
      if (returner && to === "ReturnValue") {
        for (const returnId of returnsOf(returner)) this.addRelation(returnId, callId, "framework-flow", where, proof("framework-state", `The query's value is what its ${returner} returns.`, where), "proven");
      } else if (returner && field) {
        // Replaced by a mapper the code gives (`select`), or a mapper the code does not give.
        const mapped = flows.some((flow) => {
          const mapper = flow.from === from ? key(flow.to, "\\.Parameter\\[0\\]") : undefined;
          return mapper !== undefined && flows.some((item) => item.from === `Argument[0].Member[${mapper}].ReturnValue` && item.to === to) && mapperParameter(mapper) !== null;
        });
        const fed = flows.some((flow) => flow.to === `Argument[0].Member[${returner}].Parameter[0]`);
        if (mapped || (fed && !mapperParameter(returner))) continue;
        const property = this.optionProperty(node, returner)!;
        const at = this.location(property);
        const packId = this.ensureElement(property.name, "object-pack", ownerId, { operation: "object-pack", fields: JSON.stringify({ [`${at.span.startLine}:${at.span.startColumn}`]: field }) }, null, null, null, "proven", proof("framework-state", `The hook's result holds this in its ${field} field.`, [at]));
        for (const returnId of returnsOf(returner)) this.addRelation(returnId, packId, "pack-field", [at], proof("framework-state", `The hook's ${field} is what ${property.name.getText()} returns.`, [at]), "proven");
        this.addRelation(packId, callId, "framework-flow", where, proof("framework-state", `The hook's result holds ${field}; its other fields do not hold this value.`, where), "proven");
      } else if ((returner || input) && called) {
        const mapper = fills(called[1]);
        const target = mapper ? mapperParameter(called[1]) : null;
        if (mapper && !target) continue;
        const observer = target?.mapper ?? this.optionFunction(node, called[1]);
        const index = Number(called[2]);
        const toId = target?.id ?? (observer ? parameterId(observer, index) : undefined);
        if (!observer || !toId) continue;
        const inputId = input ? parameterId(fn, 0) : undefined;
        const fromIds = returner ? returnsOf(returner) : inputId ? [inputId] : [];
        const at = [this.location(observer.declaration.parameters[index])];
        const words = returner ? `what its ${returner} returns` : `what its ${input} is called with`;
        for (const fromId of fromIds) this.addRelation(fromId, toId, "framework-flow", at, proof("framework-state", `The hook calls ${called[1]} with ${words}.`, at), "proven");
      } else if (filler && handed) {
        const inputId = parameterId(fn, 0, handed);
        const property = inputId ? this.optionProperty(node, filler) : null;
        if (!property) continue;
        const fillerFn = this.optionFunction(node, filler);
        const value = this.ts.isPropertyAssignment(property) ? property.initializer : property.name;
        const at = this.location(property.name);
        const detail = `The hook hands its ${option} an object whose ${handed} is ${fillerFn ? `what ${filler} returns` : `the options' ${filler}`}.`;
        const fromIds = fillerFn ? this.returnsByFunction.get(fillerFn.id) ?? [] : [this.expression(value, ownerId)];
        // `({ queryKey }) => …` binds the field itself; `(context) => …` binds an object that holds it.
        const first = fn.declaration.parameters[0]?.name;
        if (!(first !== undefined && this.ts.isIdentifier(first))) {
          for (const fromId of fromIds) this.addRelation(fromId, inputId!, "framework-flow", [at], proof("framework-state", detail, [at]), "proven");
          continue;
        }
        const packId = this.ensureElement(property, "object-pack", ownerId, { operation: "object-pack", fields: JSON.stringify({ [`${at.span.startLine}:${at.span.startColumn}`]: handed }) }, null, null, null, "proven", proof("framework-state", detail, [at]));
        for (const fromId of fromIds) this.addRelation(fromId, packId, "pack-field", [at], proof("framework-state", detail, [at]), "proven");
        this.addRelation(packId, inputId!, "framework-flow", [at], proof("framework-state", detail, [at]), "proven");
      }
    }
  }

  /**
   * A promise member's paths (`then`, `catch`, `finally`): each callback on
   * its own outcome (`Argument[this].Awaited`, `Awaited[error]`), what a
   * callback returns fulfilling the new promise, and the fulfilled value kept
   * where the member keeps it or no callback takes it.
   */
  private connectPromisePaths(node: TypeScript.CallExpression, callId: string, ownerId: string | null, flows: Flow[]): void {
    const callee = unwrap(this.ts, node.expression);
    if (!this.ts.isPropertyAccessExpression(callee)) return;
    const receiver = callee.expression;
    const name = calleeName(this.ts, node.expression);
    let keeps = false;
    for (const { from, to } of flows) {
      const taker = num(/^Argument\[(\d+)\]\.Parameter\[0\]$/, to);
      const returner = num(/^Argument\[(\d+)\]\.ReturnValue$/, from);
      if (from === "Argument[this].Awaited" && to === "ReturnValue.Awaited") keeps = true;
      else if (taker !== undefined && from.startsWith("Argument[this].Awaited")) {
        const handler = this.promiseHandler(node, taker);
        const rejected = from === "Argument[this].Awaited[error]";
        // No callback takes the fulfilled value, so the new promise holds it, each field still that field.
        if (!handler && !rejected) keeps = true;
        const value = rejected ? this.rejectionOf(receiver) : receiver;
        const parameter = handler?.declaration.parameters[0];
        const binding = parameter ? firstBindingIdentifier(this.ts, parameter.name) : null;
        const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
        if (!value || !parameter || !parameterId) continue;
        const where = [this.location(value), this.location(parameter)];
        const [called, calledStatus] = this.libraryProof(node, `${name} calls this function with the promise's ${rejected ? "rejection" : "fulfilled value"}.`, where);
        this.addRelation(this.expression(value, ownerId), parameterId, "framework-flow", where, called, calledStatus);
      } else if (returner !== undefined && to === "ReturnValue.Awaited") {
        const handler = this.promiseHandler(node, returner);
        if (!handler) continue;
        const where = [this.location(node.arguments[returner])];
        for (const returnId of this.returnsByFunction.get(handler.id) ?? []) {
          const [derived, derivedStatus] = this.libraryProof(node, `${name}'s promise fulfils with what this function returns.`, where);
          this.addRelation(returnId, callId, "return-value", where, derived, derivedStatus);
        }
      }
    }
    if (!keeps) return;
    const where = [this.location(receiver)];
    const [kept, keptStatus] = this.libraryProof(node, `${name} keeps the fulfilled value.`, where);
    this.addRelation(this.expression(receiver, ownerId), callId, "framework-flow", where, kept, keptStatus);
  }

  /**
   * A callback whose item the library declares as a function of no arguments
   * (`indexArray`'s `Accessor<T>`, not `mapArray`'s `T`): each call of that
   * parameter in the callback reads the item. Read from the library's own
   * declaration, so an item that is itself a function is still called.
   */
  private connectItemAccessor(node: TypeScript.CallExpression, at: number, parameterId: string): void {
    const fn = node.arguments[at] && unwrap(this.ts, node.arguments[at]);
    const item = fn && (this.ts.isArrowFunction(fn) || this.ts.isFunctionExpression(fn)) ? fn.parameters[0] : undefined;
    if (!item || !this.ts.isIdentifier(item.name)) return;
    const declared = this.checker.getResolvedSignature(node)?.declaration;
    const slot = declared && !this.ts.isJSDocSignature(declared) ? declared.parameters[at]?.type : undefined;
    const callback = slot ? this.checker.getTypeFromTypeNode(slot).getCallSignatures()[0] : undefined;
    const itemSymbol = callback?.parameters[0];
    const itemType = itemSymbol && this.checker.getTypeOfSymbol(itemSymbol);
    if (!itemType || itemType.flags & this.ts.TypeFlags.TypeParameter || !itemType.getCallSignatures().some((signature) => signature.parameters.length === 0)) return;
    const symbol = this.checker.getSymbolAtLocation(item.name);
    if (symbol) this.itemAccessors.set(symbol, parameterId);
  }

  /**
   * A resource's actions. `mutate(v)` sets the resource's value, so every read
   * of the resource sees `v`, as a setter's getter does (order and time are not
   * proven); a function given to it is an updater, not the value. `refetch(x)`
   * runs the fetcher again with `x` as its second parameter's `refetching`.
   */
  private connectResourceAction(node: TypeScript.CallExpression, resourceId: string, ownerId: string | null): boolean {
    const action = resourceAction(this.ts, this.checker, node.expression);
    if (!action) return false;
    const value = node.arguments[0] && unwrap(this.ts, node.arguments[0]);
    if (!value || this.ts.isArrowFunction(value) || this.ts.isFunctionExpression(value)) return true;
    const where = [this.location(value)];
    if (action.name === "mutate") {
      // Into the resource's binding, past the fetch boundary: what the accessor's calls read.
      const binding = this.ts.isVariableDeclaration(action.factory.parent) ? firstBindingIdentifier(this.ts, action.factory.parent.name) : undefined;
      const holderId = binding ? this.variablesBySymbol.get(this.symbolId(binding) ?? "") : undefined;
      if (!holderId) return true;
      this.addRelation(this.expression(value, ownerId), holderId, "references", where, frameworkState("mutate sets the resource's value, which its reads see; order and time are not proven.", this.location(node)), "partial");
      return true;
    }
    const fetcher = action.factory.arguments[resourceFlow(this.ts, this.checker, action.factory).returns!];
    const fn = fetcher && unwrap(this.ts, fetcher);
    const info = fn && (this.ts.isArrowFunction(fn) || this.ts.isFunctionExpression(fn) ? this.functionsByNode.get(nodeKey(this.root, fn)) : this.ts.isIdentifier(fn) ? this.targetFunction(fn) : null);
    const parameter = info?.declaration.parameters[1];
    const parameterId = parameter && this.ts.isIdentifier(parameter.name) ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") : undefined;
    if (!parameter || !parameterId) return true;
    const at = this.location(value);
    const detail = "refetch runs the fetcher again: its second parameter's refetching is this value.";
    const packId = this.ensureElement(parameter, "object-pack", ownerId, { operation: "object-pack", fields: JSON.stringify({ [`${at.span.startLine}:${at.span.startColumn}`]: "refetching" }) }, null, null, null, "proven", frameworkState(detail, at));
    this.addRelation(this.expression(value, ownerId), packId, "pack-field", where, frameworkState(detail, at), "proven");
    this.addRelation(packId, parameterId, "framework-flow", where, frameworkState(detail, at), "proven");
    return true;
  }

  /** Item parameters a library declares as accessors (`connectItemAccessor`), read when the callback's own calls are collected. */
  private readonly itemAccessors = new Map<TypeScript.Symbol, string>();

  /**
   * The instance a call runs its target in (`InstanceTag`): for a closure that
   * reads what its factory captured, the factory call its callee came from
   * (`ra.read()` after `const ra = makeReader(a)`); for an instance method,
   * the `new` its receiver came from, or `this`. Null when the target keeps
   * no per-instance state or the instance is not known.
   */
  protected instanceAt(node: TypeScript.CallExpression | TypeScript.NewExpression, target: CollectorFunctionInfo): string | null {
    const ts = this.ts;
    if (ts.isNewExpression(node)) return locationKey(this.location(node));
    if (node.expression.kind === ts.SyntaxKind.SuperKeyword) return "this";
    const callee = unwrap(ts, node.expression);
    const receiver = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
    const declaration = target.declaration;
    const factory = this.instanceSites.capturingFactory(declaration);
    if (factory) {
      const made = this.instanceSites.madeBy(receiver);
      return made && made !== "this" && ts.isCallExpression(made) && this.checker.getResolvedSignature(made)?.declaration === factory ? locationKey(this.location(made)) : null;
    }
    const method = ts.isMethodDeclaration(declaration) || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration);
    if (!method || !ts.isClassLike(declaration.parent) || ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Static || !ts.isPropertyAccessExpression(callee)) return null;
    const made = this.instanceSites.madeBy(receiver);
    return made === "this" ? made : made && ts.isNewExpression(made) ? locationKey(this.location(made)) : null;
  }

  private connectItemAccessorCall(node: TypeScript.CallExpression, callId: string): void {
    if (node.arguments.length || !this.ts.isIdentifier(node.expression)) return;
    const symbol = this.checker.getSymbolAtLocation(node.expression);
    const parameterId = symbol && this.itemAccessors.get(symbol);
    if (parameterId) this.addRelation(parameterId, callId, "accessor-call", [this.location(node)], frameworkState("The library declares the item as an accessor: calling it reads the item.", this.location(node)), "proven");
  }

  /** The action parameter of a reducer pair's reducer: where `dispatch(action)` puts its argument, however it reaches the dispatch. Null for any other pair, or a reducer the checker cannot name. */
  protected reducerAction(getter: TypeScript.Identifier): { parameter: TypeScript.ParameterDeclaration; id: string } | null {
    const reducer = reducerOf(this.ts, this.checker, getter);
    const parameter = reducer ? this.targetFunction(unwrap(this.ts, reducer))?.declaration.parameters[1] : undefined;
    const id = parameter && this.ts.isIdentifier(parameter.name) ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") : undefined;
    return parameter && id ? { parameter, id } : null;
  }

  protected processCall(
    node: TypeScript.CallExpression,
    ownerId: string | null,
  ): void {
    // `super(name)` runs the base class's constructor.
    // `f.call(t, a)`, `f.apply(t, [a])`, `g(a)` after `g = f.bind(t)`: the call runs `f` (`callAdapter`).
    const direct = this.targetFunction(node.expression) ?? (node.expression.kind === this.ts.SyntaxKind.SuperKeyword ? this.constructorTarget(node) : null) ?? this.mutationFunction(node);
    const adapter = direct ? null : this.callAdapter(node);
    const target = direct ?? adapter?.target ?? null;
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
    this.calls.push({ node, id: callId, target, ownerId, ...(adapter ? { adapter } : {}) });
    this.connectFrameworkFlow(node, callId, ownerId);
    this.connectItemAccessorCall(node, callId);
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
      !isKnownGlobal(calleeName(this.ts, node.expression)) &&
      !jsonValueMember(this.ts, this.checker, node.expression)
    ) {
      // An untyped receiver of unknown origin (a JavaScript parameter): any object may stand there, so a method's name does not say which function runs.
      const callee = unwrap(this.ts, node.expression);
      const untyped = this.ts.isPropertyAccessExpression(callee) && (this.checker.getTypeAtLocation(callee.expression).flags & this.ts.TypeFlags.Any) !== 0;
      this.gap(
        callId,
        "forward",
        "unresolved-symbol",
        untyped ? `The receiver of ${callee.getText()} is untyped (any) and its origin is not known, so which function this call runs is not known.` : "The callee has no compiler-resolved symbol.",
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
      const action = role.role === "setter" ? this.reducerAction(role.getter) : null;
      if (action && node.arguments[0]) {
        this.addRelation(this.expression(node.arguments[0], ownerId), action.id, "framework-flow", [this.location(node.arguments[0]), this.location(action.parameter)], frameworkState("The dispatch calls the reducer with this action.", this.location(node)), "proven");
      }
      // One argument is the new state (or an updater); several are a store path and the value there, written at that path.
      const values = role.role === "setter" && !action ? node.arguments : [];
      if (values.length === 1) {
        const [argument] = values;
        this.addRelation(this.expression(this.ts.isSpreadElement(argument) ? argument.expression : argument, ownerId), stateId, "references", [this.location(argument)], frameworkState("The setter's argument becomes the state its getter reads; order and time are not proven.", this.location(argument)), "partial");
      } else if (values.length > 1) {
        const value = values[values.length - 1];
        if (!this.stateUpdater(value)) this.writeStorePath(node, this.expression(value, ownerId), stateId, ownerId, this.location(value));
      }
    }
    // A callee with no body to enter (a library method, a callback, an accessor) is consumed by its call, as its arguments are. A `then` with a handler holds what the handler returns, not its receiver.
    // A store member read through its hook (`addFish` after `const { addFish } = useStore()`) has one: the call enters it (`connectBoundHandlers`).
    // A store's `set` (or `useStore.setState`) is modelled as a state setter is: what it receives is the store (`connectStores`), never its call's value.
    const storeWrite = writesStore(this.ts, this.checker, node);
    const handled = (this.channels(node)?.fulfilled === 0 && this.promiseHandler(node, 0)) || storeMember(this.ts, this.checker, node.expression).length > 0;
    if ((!role || role.through) && !storeWrite && !target && !handled && !resourceAction(this.ts, this.checker, node.expression) && !this.contextPairHalf(node.expression) && node.expression.kind !== this.ts.SyntaxKind.SuperKeyword && node.expression.kind !== this.ts.SyntaxKind.ImportKeyword) {
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
    const flow = this.flowOf(node);
    for (const [index, argument] of (role || storeWrite ? [] : node.arguments).entries()) {
      // `f.apply(t, [a, b])`: each listed value is an argument of its own, never the list.
      if (argument === adapter?.list) {
        for (const item of adapter.args) if (item) this.addRelation(this.expression(item, ownerId), callId, "argument", [this.location(item)], proof("ast-node", "The listed value is passed at this call occurrence.", [this.location(item)]), "proven");
        continue;
      }
      // A spread argument passes its elements: the value is what it spreads.
      const argumentId = this.expression(this.ts.isSpreadElement(argument) ? argument.expression : argument, ownerId);
      // The flow moves these: a passed value goes through whole, so a field stays that field, and a resource's source reaches the fetcher's parameter, never the resource.
      if (flow?.passes === "*" || flow?.passes?.includes(index) || (flow?.source === index && isResourceFactory(this.ts, this.checker, node))) continue;
      // A row that names the one argument its call hands on leaves the others out of its value (`makePersisted(pair, options)`, `splitProps(props, keys)`).
      if (Array.isArray(flow?.passes)) continue;
      // A rejection reason is not the promise's value: it reaches a rejection handler, or ends there.
      if (this.rejects(node)) continue;
      // A row that says what the call yields (its callback's return, an option function's) leaves every other argument out of it: a dependency list, a query's key.
      if (this.yieldsOnlyItsCallback(node)) continue;
      // A state pair's initial value seeds its state directly (`seedArgument`), not through the factory's call.
      if (index === 0 && seedArgument(this.ts, this.checker, node)) continue;
      // `useContext(Ctx)` returns what a provider or the default holds, never the context object.
      if (index === 0 && this.readsContext(node)) continue;
      // A resource's `mutate(v)` and `refetch(x)` hand their argument to the resource or its fetcher (`connectResourceAction`), never to the call's value.
      if (resourceAction(this.ts, this.checker, node.expression)) continue;
      // A watched function (`useSubmission(action)`) fills the result's fields (`connectWatchedFunctions`); the function itself is not the value.
      if (this.watchesFunction(node)) continue;
      // Half of a context's state pair writes or reads that state (`connectContextPairs`), never the call's value.
      if (this.contextPairHalf(node.expression)) continue;
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
    if (resourceId && this.connectResourceAction(node, resourceId, ownerId)) return;
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
   * call can leave its arguments in its receiver: when the function declares
   * that receiver, they reach its binding. A standard method's row says
   * whether it does (`rows.push(row)` keeps its argument, value used or not;
   * `rows.concat(row)` never does). Any other call is taken to only when its
   * value is discarded: that is assumed, not proven, so the relation is
   * `partial` with an `external-call` proof.
   */
  protected connectExternalCall(call: CollectorCallInfo): void {
    const resultId = this.elementIfPresent(call.node, "call-result");
    if (resultId) {
      this.addRelation(resultId, call.id, "references", [this.location(call.node)], proof("ast-node", "The collection method's result is this call's own value.", [this.location(call.node)]), "proven");
    }
    if (this.ts.isCallExpression(call.node) || this.ts.isNewExpression(call.node)) this.connectSuppliedCallbacks(call, call.node);
    if (!this.ts.isCallExpression(call.node)) return;
    const stateFunctions = this.connectStateFunctions(call.node, call.ownerId);
    this.connectExternalCallbacks(call, call.node, stateFunctions);
    const standard = standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, call.node.expression));
    if (standard ? standard.writes !== "this" : !discardsValue(this.ts, call.node, this.checker)) return;
    // A row that names the call's boundary (`client.setQueryData`, a cache write) says where its arguments go: not into the receiver.
    if (!standard && boundaryRole(this.modelFor(call.node.expression))) return;
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
    const [kept, keptStatus] = this.libraryProof(call.node, standard ? `${calleeName(this.ts, call.node.expression)} keeps its arguments in its receiver.` : `${calleeName(this.ts, call.node.expression)}'s value is discarded, so its arguments are kept in its receiver.`, [this.location(call.node), this.location(root)]);
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
        return symbol && this.checker.getTypeAtLocation(parameter).getCallSignatures().length > 0 && !this.isRejectParameter(node, fn, parameter) ? [symbol] : [];
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

  /** `reject` in `new Promise((resolve, reject) => …)`: what it is given rejects the promise, so it is no part of the promise's value. */
  private isRejectParameter(node: TypeScript.CallExpression | TypeScript.NewExpression, fn: TypeScript.SignatureDeclaration, parameter: TypeScript.ParameterDeclaration): boolean {
    return this.ts.isNewExpression(node) && fn.parameters[1] === parameter && this.checker.getTypeAtLocation(node).getSymbol()?.name === "Promise";
  }

  /**
   * Whether a module's own variable (unexported) is read in its file other
   * than as the receiver of a call whose value is dropped: `cache.get(key)`
   * reads the container back, `log.push(entry);` only writes into it.
   */
  private readBackInFile(declaration: TypeScript.VariableDeclaration): boolean {
    const cached = this.moduleReadBack.get(declaration);
    if (cached !== undefined) return cached;
    const statement = declaration.parent?.parent;
    if (!this.ts.isIdentifier(declaration.name) || !statement || !this.ts.isVariableStatement(statement) || !this.ts.isSourceFile(statement.parent)) return false;
    if (statement.modifiers?.some((modifier) => modifier.kind === this.ts.SyntaxKind.ExportKeyword)) return false;
    const name = declaration.name.text;
    const symbol = this.checker.getSymbolAtLocation(declaration.name);
    let found = false;
    const visit = (node: TypeScript.Node) => {
      if (found) return;
      if (this.ts.isIdentifier(node) && node.text === name && node !== declaration.name && this.checker.getSymbolAtLocation(node) === symbol) {
        const access = node.parent;
        const call = this.ts.isPropertyAccessExpression(access) && access.expression === node && this.ts.isCallExpression(access.parent) && access.parent.expression === access ? access.parent : null;
        if (!call || !discardsValue(this.ts, call, this.checker)) found = true;
      }
      this.ts.forEachChild(node, visit);
    };
    visit(statement.parent);
    this.moduleReadBack.set(declaration, found);
    return found;
  }

  private readonly moduleReadBack = new WeakMap<TypeScript.VariableDeclaration, boolean>();

  /**
   * A function handed to a state pair where a value goes stands for what it
   * returns: a setter's updater (`setCount((c) => c + step)`, a store path's
   * `setState("todos", (list) => [...list, item])`) and a lazy initial value
   * (`useState(() => compute(seed))`). Its returns become the state, and an
   * updater's parameter receives the current state.
   */
  private connectStateFunctions(node: TypeScript.CallExpression, ownerId: string | null): Set<TypeScript.Node> {
    const handled = new Set<TypeScript.Node>();
    const role = stateRoleOf(this.ts, this.checker, node.expression);
    const getter = role?.role === "setter" ? role.getter : lazyFactoryGetter(this.ts, this.checker, node);
    if (!getter) return handled;
    const dispatches = role && reducerOf(this.ts, this.checker, getter);
    const stateId = this.stateElement(getter);
    // A store path's last argument is its value; a function before it is a predicate that picks items, and what it returns is a test, never stored.
    const path = role && node.arguments.length > 1;
    for (const [index, argument] of node.arguments.entries()) {
      const fn = unwrap(this.ts, argument);
      const inline = this.ts.isArrowFunction(fn) || this.ts.isFunctionExpression(fn);
      if (path && index < node.arguments.length - 1) {
        if (inline) handled.add(fn);
        continue;
      }
      // `produce(fn)` (Solid's store): `fn` takes a draft of the current state, and what it writes into the draft is the new state.
      const draft = role && !dispatches ? this.producedDraft(fn) : null;
      if (draft) {
        const where = [this.location(draft.parameter)];
        this.addRelation(path ? this.readStorePath(node, stateId, ownerId) : stateId, draft.id, "references", where, frameworkState("produce hands its function a draft of the current state.", this.location(draft.parameter)), "partial");
        if (path) this.writeStorePath(node, draft.id, stateId, ownerId, this.location(draft.parameter));
        else this.addRelation(draft.id, stateId, "references", where, frameworkState("What produce's function writes into its draft becomes the state its getter reads; order and time are not proven.", this.location(draft.parameter)), "partial");
        continue;
      }
      const info = inline ? this.functionsByNode.get(nodeKey(this.root, fn)) : role ? this.stateUpdater(fn) : null;
      if (!info) continue;
      handled.add(fn);
      // A function given to a dispatch is an action, for the reducer to read; nothing calls it.
      if (dispatches) continue;
      // At a store path, what the updater returns is one value, written at that path.
      const valueId = path ? this.ensureElement(fn, "value", ownerId, { updater: true }, null, null, null, "partial", frameworkState("What the updater returns: the new value at the store path.", this.location(fn))) : stateId;
      for (const returnId of this.returnsByFunction.get(info.id) ?? []) {
        this.addRelation(returnId, valueId, "framework-flow", [this.location(fn)], frameworkState("The function's return becomes the state its getter reads; order and time are not proven.", this.location(fn)), "partial");
      }
      if (path) this.writeStorePath(node, valueId, stateId, ownerId, this.location(fn));
      // The updater receives the value it replaces: the field at the store path, not the whole store.
      const parameterId = role ? this.firstParameterId(fn) : undefined;
      if (parameterId) this.addRelation(path ? this.readStorePath(node, stateId, ownerId) : stateId, parameterId, "references", [this.location(fn)], frameworkState("The updater receives the current state.", this.location(fn)), "partial");
    }
    return handled;
  }

  /** The draft parameter of the function a `produce(fn)` call (`solid-js/store`) is given, or null for any other value. */
  private producedDraft(value: TypeScript.Expression): { parameter: TypeScript.ParameterDeclaration; id: string } | null {
    if (!this.ts.isCallExpression(value)) return null;
    const imported = importedCallee(this.ts, this.checker, value.expression);
    if (imported?.module !== "solid-js/store" || imported.name !== "produce" || !value.arguments[0]) return null;
    const fn = this.stateUpdater(value.arguments[0]);
    const parameter = fn?.declaration.parameters[0];
    const id = parameter && this.ts.isIdentifier(parameter.name) ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") : undefined;
    return parameter && id ? { parameter, id } : null;
  }

  /** The function a setter's value names (`setDoc("title", rename)`), called as an updater; null for any other value. */
  private stateUpdater(value: TypeScript.Expression): CollectorFunctionInfo | null {
    const fn = unwrap(this.ts, value);
    if (this.ts.isArrowFunction(fn) || this.ts.isFunctionExpression(fn)) return this.functionsByNode.get(nodeKey(this.root, fn)) ?? null;
    return this.ts.isIdentifier(fn) ? this.targetFunction(fn) : null;
  }

  /** The literal keys a store path starts with (`"left", "title"` in `setStore("left", "title", value)`), up to its first computed key or predicate. */
  private storeKeys(node: TypeScript.CallExpression): TypeScript.StringLiteralLike[] {
    const keys: TypeScript.StringLiteralLike[] = [];
    for (const argument of node.arguments.slice(0, -1)) {
      const key = unwrap(this.ts, argument);
      if (!this.ts.isStringLiteralLike(key)) break;
      keys.push(key);
    }
    return keys;
  }

  /**
   * Writes a value at a store path: packed field by field into the state,
   * innermost key first, so a read of a sibling field never sees it. Past a
   * computed key or a predicate, the value is the whole field there; a path
   * with no literal key writes a field the walk cannot name.
   */
  private writeStorePath(node: TypeScript.CallExpression, valueId: string, stateId: string, ownerId: string | null, location: ProgramEvidenceLocation): void {
    const keys = this.storeKeys(node);
    let from = valueId;
    for (const key of [...keys].reverse()) {
      const at = this.location(key);
      const packId = this.ensureElement(key, "object-pack", ownerId, { operation: "object-pack", fields: JSON.stringify({ [`${at.span.startLine}:${at.span.startColumn}`]: key.text }) }, null, null, null, "proven", proof("ast-node", "The store path's key is one field of the state.", [at]));
      this.addRelation(from, packId, "pack-field", [at], frameworkState("The setter writes this field of the store; order and time are not proven.", at), "partial");
      from = packId;
    }
    this.addRelation(from, stateId, keys.length ? "references" : "pack-field", [location], frameworkState("The setter's value becomes the state its getter reads; order and time are not proven.", location), "partial");
  }

  /** The field at a store path, read from the state: what an updater there receives. */
  private readStorePath(node: TypeScript.CallExpression, stateId: string, ownerId: string | null): string {
    let from = stateId;
    for (const key of this.storeKeys(node)) {
      const at = this.location(key);
      const readId = this.ensureElement(key, "field-read", ownerId, { property: key.text }, null, null, null, "proven", proof("ast-node", "The store path's key reads one field of the state.", [at]), "field-read");
      this.addRelation(from, readId, "field-input", [at], frameworkState("The updater receives this field of the store.", at), "partial");
      from = readId;
    }
    return from;
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
    this.connectCallPaths("connect", node, call.id, call.ownerId);
    // A call whose flow is modelled (`flowOf`) needs no assumption.
    if (this.flowOf(node)) return;
    const callee = calleeName(this.ts, node.expression);
    const calleeNode = unwrap(this.ts, node.expression);
    // A promise member's channels are its paths (`connectPromisePaths`).
    if (this.channels(node) && this.ts.isPropertyAccessExpression(calleeNode)) return;
    const receiver = this.ts.isPropertyAccessExpression(calleeNode) ? calleeNode.expression : null;
    if (receiver && this.connectStandardCallback(call, node, receiver)) return;
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

  /**
   * A standard method whose row names its callback's parameters (`rows.map`,
   * `rows.reduce`): each parameter takes its role's value, and the callback's
   * return reaches the call's value only where the row says the call yields it
   * (`returns: callback`). `forEach`'s return is dropped; `filter`'s, `find`'s
   * and `sort`'s only test or order elements. False for any other call.
   */
  private connectStandardCallback(call: CollectorCallInfo, node: TypeScript.CallExpression, receiver: TypeScript.Expression): boolean {
    const row = standardCallback(standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, node.expression) ?? jsonValueMember(this.ts, this.checker, node.expression)));
    if (!row) return false;
    const argument = node.arguments[row.at];
    const fn = argument && unwrap(this.ts, argument);
    // Only a function written here, as before: a named one is joined where it is declared.
    const info = fn && (this.ts.isArrowFunction(fn) || this.ts.isFunctionExpression(fn)) ? this.functionsByNode.get(nodeKey(this.root, fn)) : undefined;
    if (!info) return true;
    const name = calleeName(this.ts, node.expression);
    const returns = this.returnsByFunction.get(info.id) ?? [];
    const seed = row.seed !== undefined ? node.arguments[row.seed] : undefined;
    info.declaration.parameters.forEach((parameter, index) => {
      const role = row.parameters[index];
      const binding = firstBindingIdentifier(this.ts, parameter.name);
      const parameterId = binding ? this.parametersBySymbol.get(this.symbolId(binding) ?? "") : undefined;
      if (!parameterId || !role || role === "index") return;
      const where = [this.location(receiver), this.location(parameter)];
      if (role === "accumulator") {
        if (seed) {
          const [called, calledStatus] = this.libraryProof(node, `${name} calls this function first with ${seed.getText()}.`, where);
          this.addRelation(this.expression(seed, call.ownerId), parameterId, "callback-parameter", where, called, calledStatus);
        }
        for (const returnId of returns) {
          const [called, calledStatus] = this.libraryProof(node, `${name} calls this function again with what it returned.`, where);
          this.addRelation(returnId, parameterId, "callback-parameter", where, called, calledStatus);
        }
        return;
      }
      const [called, calledStatus] = this.libraryProof(node, `${name} calls this function with ${receiver.getText()}${role === "element" ? "'s elements" : ""}.`, where);
      this.addRelation(this.expression(receiver, call.ownerId), parameterId, "callback-parameter", where, called, calledStatus);
    });
    // A callback of one element whose return the call does not yield (`filter`, `find`, `some`, `every`) tests that element:
    // its return decides which elements count, a branch, not a value. A comparator (`sort`, two elements) orders them instead.
    const tests = row.yields === "other" && row.parameters.filter((item) => item === "element").length === 1;
    if (tests && returns.length) {
      const at = this.location(fn);
      const testId = this.ensureElement(fn, "branch-condition", call.ownerId, { terminalKind: "branch-condition", label: `${name} test` }, null, null, null, "proven", proof("standard-library", `${name} tests each element with what this function returns.`, [at]));
      for (const returnId of returns) {
        const [tested, testedStatus] = this.libraryProof(node, `${name} tests each element with what this function returns; the value is not kept.`, [at]);
        this.addRelation(returnId, testId, "predicate-return", [at], tested, testedStatus);
      }
    }
    if (row.yields !== "callback") return true;
    const where = [this.location(argument)];
    for (const returnId of returns) {
      const [derived, derivedStatus] = this.libraryProof(node, `${name}'s value derives from what this function returns.`, where);
      this.addRelation(returnId, call.id, "return-value", where, derived, derivedStatus);
    }
    return true;
  }

  /** Whether a call reads a context (`useContext(Ctx)`); the JSX support knows contexts. */
  protected readsContext(_node: TypeScript.CallExpression): boolean {
    return false;
  }

  /** A standard promise member's channels (`promiseChannels`), or null for any other call. */
  private channels(node: TypeScript.CallExpression) {
    return promiseChannels(standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, node.expression)));
  }

  /** Whether the call makes a promise that only rejects (`Promise.reject`, a row's `settles: reject`). */
  private rejects(node: TypeScript.CallExpression) {
    return standardMemberModel(builtinLibraryModels(), browserMember(this.ts, this.checker, node.expression))?.settles === "reject";
  }

  /** The function a promise method is given at this argument, written there or named. */
  private promiseHandler(node: TypeScript.CallExpression, index: number | undefined) {
    const handler = index !== undefined && node.arguments[index] ? unwrap(this.ts, node.arguments[index]) : null;
    return handler ? this.functionsByNode.get(nodeKey(this.root, handler)) ?? this.targetFunction(handler) : null;
  }

  /** The reason a promise rejects with, where the code says so: `Promise.reject(reason)`, through bindings and the links it skips. Null for a promise that may settle any way. */
  private rejectionOf(expression: TypeScript.Expression): TypeScript.Expression | null {
    let value: TypeScript.Expression | undefined = unwrap(this.ts, expression);
    for (let step = 0; step < 8 && value; step++) {
      if (this.ts.isIdentifier(value)) {
        const origin: TypeScript.Node | undefined = resolveValue(this.ts, this.checker, value)?.origin;
        value = origin && this.ts.isExpression(origin) ? unwrap(this.ts, origin) : undefined;
        continue;
      }
      if (!this.ts.isCallExpression(value)) return null;
      if (this.rejects(value)) return value.arguments[0] ?? null;
      const method = unwrap(this.ts, value.expression);
      // A link with no rejection handler passes the rejection on (`finally`, `then(onFulfilled)`).
      const channels = this.channels(value);
      const skips = channels !== null && (channels.rejected === undefined || !value.arguments[channels.rejected]);
      if (!skips || !this.ts.isPropertyAccessExpression(method)) return null;
      value = unwrap(this.ts, method.expression);
    }
    return null;
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
      this.expressionContext,
      node,
      ownerId,
    );
  }
}

