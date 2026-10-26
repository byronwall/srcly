import * as TypeScript from "typescript";
import type { ProgramElementKind } from "./program-evidence";
import type { CollectorFunctionInfo } from "./program-evidence-collector-support";
import { ProgramEvidenceCollectorFieldTransferSupport } from "./program-evidence-collector-field-transfers";
import { reachingBindings } from "./program-evidence-reaching-bindings";
import {
  derivedOperands,
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
  protected collectNodes(file: TypeScript.SourceFile): void {
    const visit = (node: TypeScript.Node, ownerId: string | null) => {
      this.noteAstUnit();
      const info = this.functionsByNode.get(nodeKey(this.root, node));
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
        isExitStatusAssignment(this.ts, node)
      ) {
        this.processExitStatusAssignment(node, nextOwner);
      }
      if (this.ts.isBinaryExpression(node) && isAssignmentOperator(this.ts, node.operatorToken.kind) && this.ts.isIdentifier(node.left)) {
        this.processAssignment(node as TypeScript.BinaryExpression & { left: TypeScript.Identifier }, nextOwner);
      }
      if (this.ts.isReturnStatement(node)) {
        this.processReturn(node, nextOwner);
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
    visit(file, null);
  }

  protected processJsx(
    node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement,
    ownerId: string | null,
  ): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(node.getSourceFile());
    const { target, aliasId } = this.renderedComponent(opening.tagName);
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
      if (!component) {
        this.addTerminal(
          value,
          ownerId,
          "dom-attribute",
          attribute.name.getText(),
          valueId,
        );
      }
    }
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
    terminalKind: "jsx-text" | "dom-attribute" | "style",
    label: string,
    valueId: string,
  ): void {
    const kind: ProgramElementKind = terminalKind === "jsx-text"
      ? "render-terminal"
      : "dom-terminal";
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

  protected connectCalls(): void {
    this.connectComponentPropBindings();
    this.connectFieldTransfers();
    for (const call of this.calls) {
      this.checkCancellation();
      if (!call.target) this.connectExternalCall(call);
      if (call.target) {
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
  }

  protected connectPendingReferences(): void {
    for (const reference of this.references) {
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
