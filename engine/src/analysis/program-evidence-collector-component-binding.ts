import * as TypeScript from "typescript";
import type { CollectorFunctionInfo } from "./program-evidence-collector-support";
import { ProgramEvidenceCollectorBoundaryProcessing } from "./program-evidence-collector-boundary-processing";
import { importedCallee, proof, unwrap } from "./program-evidence-support";
import { frameworkFlow } from "./framework-flows";

export type PendingComponentPropBinding = {
  opening: TypeScript.JsxOpeningLikeElement;
  attribute: TypeScript.JsxAttribute;
  valueId: string;
  occurrenceId: string;
  ownerId: string | null;
  target: CollectorFunctionInfo;
};

type ComponentPropReceiver = {
  node: TypeScript.Node;
  elementId: string;
  parameterId: string;
  parameter: TypeScript.ParameterDeclaration;
};

/** Collect exact JSX-to-component parameter member evidence after node facts exist. */
export class ProgramEvidenceCollectorComponentBindingSupport extends ProgramEvidenceCollectorBoundaryProcessing {
  protected readonly pendingComponentPropBindings: PendingComponentPropBinding[] = [];

  protected queueComponentPropBinding(
    opening: TypeScript.JsxOpeningLikeElement,
    attribute: TypeScript.JsxAttribute,
    valueId: string,
    occurrenceId: string,
    ownerId: string | null,
    target: CollectorFunctionInfo,
  ): void {
    this.pendingComponentPropBindings.push({ opening, attribute, valueId, occurrenceId, ownerId, target });
  }

  protected connectComponentPropBindings(): void {
    for (const pending of this.pendingComponentPropBindings) {
      this.checkCancellation();
      const propName = staticPropName(this.ts, pending.attribute);
      if (!propName) continue;
      const receivers = this.componentPropReceivers(pending.target, propName);
      if (receivers.length === 0) continue;
      for (const receiver of receivers) {
        this.checkCancellation();
        const bindingId = this.ensureElement(
          pending.attribute,
          "component-prop-binding",
          pending.ownerId,
          {
            propName,
            valueMode: componentPropValueMode(this.ts, pending.attribute),
            sourceFieldName: componentPropSourceField(this.ts, pending.attribute),
            componentOccurrenceElementId: pending.occurrenceId,
            componentDefinitionId: pending.target.id,
            parameterElementId: receiver.parameterId,
            receiverElementId: receiver.elementId,
            candidateCount: 1,
          },
          null,
          null,
          pending.target.id,
          "proven",
          proof(
            "component-prop-binding",
            "The static JSX prop has one exact in-project component parameter member binding.",
            [this.location(pending.opening), this.location(pending.attribute), this.location(receiver.parameter), this.location(receiver.node)],
          ),
        );
        this.addRelation(
          pending.valueId,
          bindingId,
          "component-prop-binding",
          [this.location(pending.attribute), this.location(receiver.node)],
          proof(
            "component-prop-binding",
            "The component-prop value reaches one occurrence-specific binding with one compiler-backed receiver.",
            [this.location(pending.attribute), this.location(receiver.parameter), this.location(receiver.node)],
          ),
          "proven",
        );
        this.addRelation(
          bindingId,
          receiver.elementId,
          "component-prop-binding",
          [this.location(pending.attribute), this.location(receiver.node), this.location(receiver.parameter)],
          proof(
            "component-prop-binding",
            "The binding element points to the parameter-rooted receiver by compiler symbol and property evidence.",
            [this.location(pending.attribute), this.location(receiver.node), this.location(receiver.parameter)],
          ),
          "proven",
        );
      }
    }
    this.pendingComponentPropBindings.length = 0;
    this.checkCancellation();
  }

  private componentPropReceivers(
    target: CollectorFunctionInfo,
    propName: string,
  ): ComponentPropReceiver[] {
    this.checkCancellation();
    // A component's props are its first parameter; `forwardRef`'s render takes the ref second.
    if (target.declaration.parameters.length < 1) return [];
    const parameter = target.declaration.parameters[0];
    if (parameter.dotDotDotToken || parameter.questionToken || parameter.initializer) return [];
    // An optional prop binds like a required one: the attribute at this occurrence is what it receives here.
    const expectedProperty = this.checker.getPropertyOfType(this.checker.getTypeAtLocation(parameter.name), propName);
    if (!expectedProperty) return [];
    // A destructured parameter (`{ title }`) receives the prop in the binding that names it: that binding is the read.
    if (this.ts.isObjectBindingPattern(parameter.name)) {
      const element = parameter.name.elements.find((item) => {
        const key = item.propertyName ?? item.name;
        return !item.dotDotDotToken && this.ts.isIdentifier(item.name) && (this.ts.isIdentifier(key) || this.ts.isStringLiteral(key)) && key.text === propName;
      });
      const bindingId = element ? this.parametersBySymbol.get(this.symbolId(element.name) ?? "") : undefined;
      return element && bindingId ? [{ node: element, elementId: bindingId, parameterId: bindingId, parameter }] : [];
    }
    if (!this.ts.isIdentifier(parameter.name)) return [];
    const parameterSymbol = this.checker.getSymbolAtLocation(parameter.name);
    const parameterId = parameterSymbol
      ? this.parametersBySymbol.get(this.symbolId(parameter.name) ?? "") ?? null
      : null;
    if (!parameterSymbol || !parameterId) return [];

    const views = this.propsViews(target.declaration, parameterSymbol);
    const receivers: ComponentPropReceiver[] = [];
    const visit = (node: TypeScript.Node) => {
      this.checkCancellation();
      const receiver = this.ts.isPropertyAccessExpression(node) && this.ts.isIdentifier(node.expression) ? this.checker.getSymbolAtLocation(node.expression) : undefined;
      if (
        this.ts.isPropertyAccessExpression(node)
        && !node.questionDotToken
        && node.name.text === propName
        && receiver
        // `props.label` reads the prop itself; a view's `local.label` reads the field of the same name.
        && (sameCompilerSymbol(receiver, parameterSymbol) ? sameCompilerSymbol(this.checker.getSymbolAtLocation(node.name), expectedProperty) : views.has(receiver))
      ) {
        receivers.push({
          node,
          elementId: this.elementFor(node, "field-read"),
          parameterId,
          parameter,
        });
      }
      this.ts.forEachChild(node, visit);
    };
    visit(target.declaration);
    this.checkCancellation();
    return receivers;
  }

  /**
   * The bindings in a component that hold a view of its props: a `const`
   * copy, or what a framework call that passes its argument through returns
   * (`mergeProps(defaults, props)`, both halves of `splitProps(props, keys)`),
   * from props or from another view. A field read of a view reads that prop.
   */
  private propsViews(declaration: TypeScript.SignatureDeclaration, props: TypeScript.Symbol): Set<TypeScript.Symbol> {
    const views = new Set<TypeScript.Symbol>();
    const isView = (expression: TypeScript.Expression) => {
      const symbol = this.ts.isIdentifier(expression) ? this.checker.getSymbolAtLocation(expression) : undefined;
      return !!symbol && (symbol === props || views.has(symbol));
    };
    const passesView = (initializer: TypeScript.Expression) => {
      const value = unwrap(this.ts, initializer);
      if (isView(value)) return true;
      if (!this.ts.isCallExpression(value)) return false;
      const imported = importedCallee(this.ts, this.checker, value.expression);
      const passes = imported ? frameworkFlow(imported.module, imported.name)?.passes : undefined;
      if (!passes) return false;
      return value.arguments.some((argument, index) => (passes === "*" || passes.includes(index)) && isView(unwrap(this.ts, argument)));
    };
    // In source order, so a view built from an earlier view is found in one pass.
    const visit = (node: TypeScript.Node) => {
      if (this.ts.isVariableDeclaration(node) && node.initializer && passesView(node.initializer)) {
        const names = this.ts.isIdentifier(node.name) ? [node.name] : this.ts.isArrayBindingPattern(node.name) ? node.name.elements.flatMap((item) => (this.ts.isBindingElement(item) && this.ts.isIdentifier(item.name) ? [item.name] : [])) : [];
        for (const name of names) {
          const symbol = this.checker.getSymbolAtLocation(name);
          if (symbol) views.add(symbol);
        }
      }
      this.ts.forEachChild(node, visit);
    };
    const body = (declaration as { body?: TypeScript.Node }).body;
    if (body) visit(body);
    return views;
  }
}

function componentPropValueMode(
  ts: typeof TypeScript,
  attribute: TypeScript.JsxAttribute,
): "whole-object" | "scalar-alias" | null {
  const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : null;
  if (expression && ts.isCallExpression(expression)) return "whole-object";
  if (expression && ts.isPropertyAccessExpression(expression) && ts.isCallExpression(expression.expression)) {
    return "scalar-alias";
  }
  return null;
}

function componentPropSourceField(
  ts: typeof TypeScript,
  attribute: TypeScript.JsxAttribute,
): string | null {
  const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : null;
  return expression && ts.isPropertyAccessExpression(expression) ? expression.name.text : null;
}

function staticPropName(ts: typeof TypeScript, attribute: TypeScript.JsxAttribute): string | null {
  return ts.isIdentifier(attribute.name) ? attribute.name.text : null;
}

function sameCompilerSymbol(
  left: TypeScript.Symbol | undefined,
  right: TypeScript.Symbol | undefined,
): boolean {
  return Boolean(left && right && left === right);
}
