import * as TypeScript from "typescript";
import { stateRoleOf } from "./program-evidence-state-pairs";
import { ProgramEvidenceCollectorCallSupport } from "./program-evidence-collector-call-support";
import { objectPackAttributes } from "./program-evidence-collector-expression-support";
import {
  bindingIdentifiers,
  browserMember,
  firstBindingIdentifier,
  importedCallee,
  nodeKey,
  propertyBase,
  proof,
  responseReturnRole,
  unwrap,
} from "./program-evidence-support";
import { indexReadAttributes } from "./program-index-read-metadata";
import { optionFlow } from "./framework-flows";
import { resolveValue } from "./value-origin";
import type { CollectorCallInfo, CollectorFunctionInfo } from "./program-evidence-collector-support";

export class ProgramEvidenceCollectorBoundaryProcessing extends ProgramEvidenceCollectorCallSupport {
  protected processProperty(
    node: TypeScript.PropertyAccessExpression,
    ownerId: string | null,
  ): void {
    const fieldId = this.ensureElement(
      node,
      "field-read",
      ownerId,
      { property: node.name.text },
      this.symbolId(node.name),
      this.moduleFor(node.name),
      null,
      "proven",
      proof(
        "property-access",
        "The property access is compiler-backed syntax.",
        [this.location(node)],
      ),
      "field-read",
    );
    // A property that holds a state pair's getter (`state.doc` for `{ doc }`) reads the pair's state.
    const role = stateRoleOf(this.ts, this.checker, node);
    if (role?.role === "getter") {
      this.addRelation(this.stateElement(role.getter), fieldId, "references", [this.location(node)], proof("framework-state", "The property holds the getter of a state pair: it reads that state.", [this.location(node)]), "partial");
    }
    const receiverId = this.expression(node.expression, ownerId);
    this.addRelation(
      receiverId,
      fieldId,
      "field-input",
      [this.location(node.expression)],
      proof(
        "property-access",
        "The receiver supplies the property-read value.",
        [this.location(node)],
      ),
      "proven",
    );
    const resourceId = this.resourceBySymbol.get(this.symbolId(node.expression) ?? "");
    const resourceAliasId = this.variablesBySymbol.get(this.symbolId(node.expression) ?? "");
    if (resourceId && resourceAliasId && node.name.text === "latest") {
      this.addRelation(
        resourceAliasId,
        fieldId,
        "carrier",
        [this.location(node.expression), this.location(node)],
        proof(
          "resource-boundary",
          "The exact resource.latest accessor is the compiler-resolved result of this createResource binding.",
          [this.location(node.expression), this.location(node)],
        ),
        "proven",
      );
    }
    const environmentBase = propertyBase(this.ts, node, this.globalMembers.environment);
    if (environmentBase) {
      const baseIsValue = environmentBase === node;
      const inputId = this.specialInput(
        environmentBase,
        "environment-input",
        ownerId,
        { key: null },
        "host-api",
        "The exact environment property is a source-backed process input.",
      );
      this.addRelation(
        inputId,
        fieldId,
        "references",
        [this.location(environmentBase), this.location(node)],
        proof(
          "host-api",
          "The environment input is connected to its property occurrence.",
          [this.location(environmentBase), this.location(node)],
        ),
        "proven",
      );
      if (!baseIsValue) {
        const propertyInputId = this.specialInput(
          node,
          "environment-input",
          ownerId,
          { key: node.name.text },
          "host-api",
          "The environment property value is a source-backed input.",
        );
        this.addRelation(
          propertyInputId,
          fieldId,
          "references",
          [this.location(node)],
          proof(
            "host-api",
            "The environment property value is connected to its field occurrence.",
            [this.location(node)],
          ),
          "proven",
        );
      }
    }
    const processBase = propertyBase(this.ts, node, this.globalMembers.process);
    if (processBase) {
      const inputId = this.specialInput(
        processBase,
        "process-input",
        ownerId,
        { name: processBase.getText(node.getSourceFile()) },
        "host-api",
        "The exact process property is a source-backed process input.",
      );
      this.addRelation(
        inputId,
        fieldId,
        "references",
        [this.location(processBase), this.location(node)],
        proof(
          "host-api",
          "The process input is connected to its property occurrence.",
          [this.location(processBase), this.location(node)],
        ),
        "proven",
      );
    }
  }

  protected processIndex(
    node: TypeScript.ElementAccessExpression,
    ownerId: string | null,
  ): void {
    const id = this.ensureElement(
      node,
      "index-read",
      ownerId,
      indexReadAttributes(this.ts, node),
      this.symbolId(node.expression),
      null,
      null,
      "proven",
      proof(
        "property-access",
        "The element access is source-backed syntax.",
        [this.location(node)],
      ),
      "index-read",
    );
    // A computed key reads some field of the receiver, which one the source does not say: the read is partial, not a stop.
    const staticKey = !!node.argumentExpression && (this.ts.isStringLiteral(node.argumentExpression) || this.ts.isNumericLiteral(node.argumentExpression));
    this.addRelation(
      this.expression(node.expression, ownerId),
      id,
      "field-input",
      [this.location(node.expression)],
      proof(
        "property-access",
        staticKey ? "The indexed receiver supplies the read value." : "The indexed receiver supplies the read value; the computed key reads some field of it.",
        [this.location(node)],
      ),
      staticKey ? "proven" : "partial",
    );
    // The key is a value occurrence of its own: it picks the field, so a walk that reaches it ends there.
    if (node.argumentExpression && !staticKey) this.expression(node.argumentExpression, ownerId);
    const receiverText = node.expression.getText(node.getSourceFile());
    if (this.globalMembers.environment.includes(receiverText)) {
      const inputId = this.specialInput(
        node.expression,
        "environment-input",
        ownerId,
        { key: null },
        "host-api",
        "The exact process.env property is a source-backed input.",
      );
      this.addRelation(
        inputId,
        id,
        "references",
        [this.location(node.expression), this.location(node)],
        proof(
          "host-api",
          "The environment input is connected to its indexed value occurrence.",
          [this.location(node.expression), this.location(node)],
        ),
        "proven",
      );
    } else if (this.globalMembers.process.includes(receiverText)) {
      const inputId = this.specialInput(
        node.expression,
        "process-input",
        ownerId,
        { name: receiverText },
        "host-api",
        "The exact process property is a source-backed input.",
      );
      this.addRelation(
        inputId,
        id,
        "references",
        [this.location(node.expression), this.location(node)],
        proof(
          "host-api",
          "The process input is connected to its indexed value occurrence.",
          [this.location(node.expression), this.location(node)],
        ),
        "proven",
      );
    }
  }

  /** An object or array literal packs its fields, its elements and what it spreads. */
  protected processObject(
    node: TypeScript.ObjectLiteralExpression | TypeScript.ArrayLiteralExpression,
    ownerId: string | null,
  ): void {
    const packId = this.ensureElement(
      node,
      "object-pack",
      ownerId,
      objectPackAttributes(this.ts, node, (item) => this.location(item)),
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The literal packs source-backed fields or elements.",
        [this.location(node)],
      ),
      "object-pack",
    );
    if (this.ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (this.ts.isOmittedExpression(element)) continue;
        this.addRelation(
          this.expression(this.ts.isSpreadElement(element) ? element.expression : element, ownerId),
          packId,
          "pack-field",
          [this.location(element)],
          proof(
            "ast-node",
            this.ts.isSpreadElement(element) ? "The spread contributes its elements to the array pack." : "The element contributes to the array pack.",
            [this.location(element)],
          ),
          "proven",
        );
      }
      return;
    }
    for (const property of node.properties) {
      // `{ x }` is `{ x: x }`: the shorthand's name reads the value it packs.
      if (this.ts.isPropertyAssignment(property) || this.ts.isShorthandPropertyAssignment(property)) {
        this.addRelation(
          this.expression(this.ts.isPropertyAssignment(property) ? property.initializer : property.name, ownerId),
          packId,
          "pack-field",
          [this.location(property)],
          proof(
            "ast-node",
            "The property assignment contributes to the object pack.",
            [this.location(property)],
          ),
          "proven",
        );
      } else if (this.ts.isSpreadAssignment(property)) {
        this.addRelation(
          this.expression(property.expression, ownerId),
          packId,
          "pack-field",
          [this.location(property)],
          proof(
            "ast-node",
            "The spread assignment contributes to the object pack.",
            [this.location(property)],
          ),
          "proven",
        );
      }
    }
  }

  /** A `for…of` binding takes each element of what it iterates. */
  protected processForOf(node: TypeScript.ForOfStatement, ownerId: string | null): void {
    if (!this.ts.isVariableDeclarationList(node.initializer)) return;
    for (const declaration of node.initializer.declarations) {
      const aliasId = this.ensureElement(
        declaration,
        "alias",
        ownerId,
        { name: declaration.name.getText(declaration.getSourceFile()) },
        this.symbolId(firstBindingIdentifier(this.ts, declaration.name) ?? declaration.name),
        null,
        null,
        "proven",
        proof("ast-node", "The loop binding names each element it iterates.", [this.location(declaration)]),
      );
      for (const binding of bindingIdentifiers(this.ts, declaration.name)) {
        const bindingId = this.symbolId(binding);
        if (bindingId && !this.variablesBySymbol.has(bindingId)) this.variablesBySymbol.set(bindingId, aliasId);
      }
      this.addRelation(
        this.expression(node.expression, ownerId),
        aliasId,
        "for-element",
        [this.location(node.expression)],
        proof("ast-node", "Each element of the iterated value is bound to the loop variable.", [this.location(node)]),
        "proven",
      );
    }
  }

  protected processSelection(
    node: TypeScript.ConditionalExpression | TypeScript.BinaryExpression,
    ownerId: string | null,
  ): void {
    const operator = this.ts.isConditionalExpression(node)
      ? "conditional"
      : node.operatorToken.getText(node.getSourceFile());
    const id = this.ensureElement(
      node,
      "selection",
      ownerId,
      { operator },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The source expression selects between values or branches.",
        [this.location(node)],
      ),
      "selection",
    );
    const parts = this.ts.isConditionalExpression(node)
      ? [node.condition, node.whenTrue, node.whenFalse]
      : [node.left, node.right];
    for (const part of parts) {
      this.addRelation(
        this.expression(part, ownerId),
        id,
        "references",
        [this.location(part)],
        proof(
          "ast-node",
          "The branch expression contributes to the selection.",
          [this.location(part)],
        ),
        "proven",
      );
    }
  }

  /** An operator expression (comparison, arithmetic, `!`, `typeof`, a template) carries each operand into its value. */
  protected processDerived(
    node: TypeScript.Expression,
    operands: readonly TypeScript.Expression[],
    ownerId: string | null,
  ): void {
    const id = this.expression(node, ownerId);
    for (const operand of operands) {
      this.addRelation(
        this.expression(operand, ownerId),
        id,
        "references",
        [this.location(operand)],
        proof(
          "ast-node",
          "The operand contributes to the derived value.",
          [this.location(operand)],
        ),
        "proven",
      );
    }
  }

  /**
   * An assignment to a local variable or parameter rebinds it: the assigned
   * value (and, for `+=` and the like, the old one) reaches a binding at the
   * assignment, which the reads it can reach see (`reachingBindings`).
   */
  protected processAssignment(
    node: TypeScript.BinaryExpression & { left: TypeScript.Identifier },
    ownerId: string | null,
  ): void {
    const symbolId = this.symbolId(node.left);
    const declared = this.checker.getSymbolAtLocation(node.left)?.valueDeclaration;
    const declaration = declared && this.ts.findAncestor(declared, (item) => this.ts.isVariableDeclaration(item) || this.ts.isParameter(item));
    if (!symbolId || !declaration || declaration.getSourceFile().isDeclarationFile) return;
    const bindingId = this.ensureElement(
      node,
      "alias",
      ownerId,
      { name: node.left.text },
      symbolId,
      null,
      null,
      "proven",
      proof("ast-node", "The assignment rebinds the variable.", [this.location(node)]),
    );
    const values = node.operatorToken.kind === this.ts.SyntaxKind.EqualsToken ? [node.right] : [node.left, node.right];
    for (const value of values) {
      this.addRelation(
        this.expression(value, ownerId),
        bindingId,
        "references",
        [this.location(value)],
        proof("ast-node", "The value is bound to the variable at this assignment.", [this.location(node)]),
        "proven",
      );
    }
    const entry = this.assignments.get(symbolId) ?? this.assignments.set(symbolId, { declaration, bindings: [] }).get(symbolId)!;
    if (!entry.bindings.some((binding) => binding.id === bindingId)) entry.bindings.push({ id: bindingId, node });
  }

  /**
   * `o.title = value` on a variable or parameter the project declares packs
   * the value into `o` under `title`, as `{ title: value }` would: a later
   * read of `o.title` sees it, and a read of another field does not.
   */
  protected processFieldAssignment(
    node: TypeScript.BinaryExpression & { left: TypeScript.PropertyAccessExpression },
    ownerId: string | null,
  ): void {
    const receiver = node.left.expression;
    const receiverSymbol = this.ts.isIdentifier(receiver) ? this.symbolId(receiver) ?? "" : "";
    const holderId = this.variablesBySymbol.get(receiverSymbol) ?? this.parametersBySymbol.get(receiverSymbol);
    // `this.title = value`, `state.card.title = value`: no local object to pack into, so the member itself keeps it.
    // A property the browser declares (`document.title`, `el.textContent`) is written to the page.
    if (!holderId) {
      const valueId = this.expression(node.right, ownerId);
      if (browserMember(this.ts, this.checker, node.left)) return this.processBrowserWrite(node, valueId, ownerId);
      return this.addMemberWrite(node.left, valueId);
    }
    const field = node.left.name;
    const { span } = this.location(field);
    const packId = this.ensureElement(
      node,
      "object-pack",
      ownerId,
      { operation: "object-pack", fields: JSON.stringify({ [`${span.startLine}:${span.startColumn}`]: field.text }) },
      null,
      null,
      null,
      "proven",
      proof("ast-node", "The assignment sets one field of the object.", [this.location(node)]),
    );
    this.addRelation(
      this.expression(node.right, ownerId),
      packId,
      "pack-field",
      [this.location(field)],
      proof("ast-node", "The assigned value is packed under this field.", [this.location(field)]),
      "proven",
    );
    this.addRelation(
      packId,
      holderId,
      "references",
      [this.location(receiver)],
      proof("ast-node", "The object the assignment sets a field of.", [this.location(receiver)]),
      "proven",
    );
  }

  /** `location.search`, `document.cookie`: the browser hands the program this value, an origin. */
  protected processBrowserRead(node: TypeScript.PropertyAccessExpression, ownerId: string | null): void {
    const readId = this.specialInput(node, "external-read", ownerId, { operation: node.name.text, name: `browser read: ${node.getText(node.getSourceFile())}` }, "host-api", "The browser hands the program this value.");
    this.addRelation(readId, this.expression(node, ownerId), "carrier", [this.location(node)], proof("carrier-boundary", "The property read yields what the browser holds.", [this.location(node)]), "proven");
  }

  /** `document.title = value`: the value is written into the page, an end. */
  protected processBrowserWrite(node: TypeScript.BinaryExpression & { left: TypeScript.PropertyAccessExpression }, valueId: string, ownerId: string | null): void {
    const writeId = this.specialInput(node, "external-effect", ownerId, { operation: node.left.name.text, name: `page write: ${node.left.getText(node.getSourceFile())}` }, "host-api", "The assignment writes the value into the page.");
    this.addRelation(valueId, writeId, "effect-input", [this.location(node)], proof("host-api", "The browser property keeps the assigned value.", [this.location(node)]), "proven");
  }

  protected connectExternalCall(call: CollectorCallInfo): void {
    super.connectExternalCall(call);
    if (this.ts.isCallExpression(call.node)) this.connectOptionFlows(call, call.node);
  }

  /** The function a data hook's options object names under `option` (`useQuery({ queryFn })`), or null. */
  private optionFunction(hook: TypeScript.Expression, option: "queryFn" | "mutationFn"): CollectorFunctionInfo | null {
    const call = unwrap(this.ts, hook);
    if (!this.ts.isCallExpression(call)) return null;
    const imported = importedCallee(this.ts, this.checker, call.expression);
    if (!imported || optionFlow(imported.module, imported.name) !== option) return null;
    const options = call.arguments[0] ? unwrap(this.ts, call.arguments[0]) : undefined;
    const property = options && this.ts.isObjectLiteralExpression(options) ? options.properties.find((item) => item.name?.getText() === option) : undefined;
    if (!property || !(this.ts.isPropertyAssignment(property) || this.ts.isShorthandPropertyAssignment(property))) return null;
    const value = this.ts.isPropertyAssignment(property) ? unwrap(this.ts, property.initializer) : property.name;
    return this.functionsByNode.get(nodeKey(this.root, value)) ?? this.targetFunction(value);
  }

  /** A query's value is what its `queryFn` returns; `mutation.mutate(x)` calls its `mutationFn` with `x` (a row's `option`). */
  private connectOptionFlows(call: CollectorCallInfo, node: TypeScript.CallExpression): void {
    const where = [this.location(node)];
    const query = this.optionFunction(node, "queryFn");
    for (const returnId of query ? this.returnsByFunction.get(query.id) ?? [] : []) {
      this.addRelation(returnId, call.id, "framework-flow", where, proof("framework-state", "The query's value is what its queryFn returns.", where), "proven");
    }
    const callee = unwrap(this.ts, node.expression);
    if (!this.ts.isPropertyAccessExpression(callee) || !/^(mutate|mutateAsync)$/.test(callee.name.text) || !node.arguments[0]) return;
    const hook = resolveValue(this.ts, this.checker, callee.expression)?.origin;
    const mutation = hook && this.ts.isExpression(hook) ? this.optionFunction(hook, "mutationFn") : null;
    const parameter = mutation?.declaration.parameters[0];
    const parameterId = parameter && this.ts.isIdentifier(parameter.name) ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") : undefined;
    if (parameterId) this.addRelation(this.expression(node.arguments[0], call.ownerId), parameterId, "framework-flow", where, proof("framework-state", "The mutation calls its mutationFn with what mutate is given.", where), "proven");
    for (const returnId of mutation ? this.returnsByFunction.get(mutation.id) ?? [] : []) {
      this.addRelation(returnId, call.id, "framework-flow", where, proof("framework-state", "mutateAsync yields what the mutationFn returns.", where), "proven");
    }
  }

  protected processExitStatusAssignment(
    node: TypeScript.BinaryExpression,
    ownerId: string | null,
  ): void {
    const terminalId = this.specialInput(
      node,
      "exit-status",
      ownerId,
      {
        property: "process.exitCode",
        operator: node.operatorToken.getText(node.getSourceFile()),
      },
      "host-api",
      "Assignment to process.exitCode is an exit-status terminal.",
    );
    const valueId = this.expression(node.right, ownerId);
    this.addRelation(
      valueId,
      terminalId,
      "effect-input",
      [this.location(node.right), this.location(node)],
      proof(
        "host-api",
        "The assigned value reaches process.exitCode at this source assignment.",
        [this.location(node.right), this.location(node)],
      ),
      "proven",
    );
  }

  /** Whether a value is void, or void only short of an optional call (`void | undefined`). */
  private returnsNothing(node: TypeScript.Node): boolean {
    const type = this.checker.getTypeAtLocation(node);
    const parts = type.isUnion() ? type.types : [type];
    return parts.some((part) => part.flags & this.ts.TypeFlags.Void) && parts.every((part) => part.flags & (this.ts.TypeFlags.Void | this.ts.TypeFlags.Undefined));
  }

  /** A return statement, or an arrow function's expression body, which is its return. */
  protected processReturn(
    node: TypeScript.ReturnStatement | TypeScript.Expression,
    ownerId: string | null,
  ): void {
    if (!ownerId) return;
    const expression = this.ts.isReturnStatement(node) ? node.expression : node;
    // An arrow's body that is a void call (`(name) => console.log(name)`, `() => ref.current?.focus()`) returns nothing: no value comes back out at its call.
    if (!this.ts.isReturnStatement(node) && this.ts.isArrowFunction(node.parent) && this.returnsNothing(node)) return;
    const terminalRole = expression
      ? responseReturnRole(this.ts, expression)
      : null;
    const returnId = this.ensureElement(
      node,
      "return",
      ownerId,
      {
        name: "return",
        ...(terminalRole ? { terminalRole } : {}),
      },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The return statement is owned by the containing function.",
        [this.location(node)],
      ),
    );
    const values = this.returnsByFunction.get(ownerId) ?? [];
    if (!values.includes(returnId)) values.push(returnId);
    this.returnsByFunction.set(ownerId, values);
    if (expression) {
      this.addRelation(
        this.expression(expression, ownerId),
        returnId,
        "return-expression",
        [this.location(expression)],
        proof(
          "return-expression",
          "The return expression supplies the function return.",
          [this.location(node)],
        ),
        "proven",
      );
    }
  }
}
