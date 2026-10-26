import * as TypeScript from "typescript";
import { ProgramEvidenceCollectorCallSupport } from "./program-evidence-collector-call-support";
import {
  bindingIdentifiers,
  firstBindingIdentifier,
  propertyBase,
  proof,
  responseReturnRole,
} from "./program-evidence-support";
import { indexReadAttributes } from "./program-index-read-metadata";

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
    const environmentBase = propertyBase(this.ts, node, [
      "process.env",
      "import.meta.env",
    ]);
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
    const processBase = propertyBase(this.ts, node, [
      "process.argv",
      "process.stdin",
    ]);
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
    if (receiverText === "process.env") {
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
    } else if (receiverText === "process.argv" || receiverText === "process.stdin") {
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
      { operation: "object-pack" },
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
      if (this.ts.isPropertyAssignment(property)) {
        this.addRelation(
          this.expression(property.initializer, ownerId),
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

  /** A return statement, or an arrow function's expression body, which is its return. */
  protected processReturn(
    node: TypeScript.ReturnStatement | TypeScript.Expression,
    ownerId: string | null,
  ): void {
    if (!ownerId) return;
    const expression = this.ts.isReturnStatement(node) ? node.expression : node;
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
