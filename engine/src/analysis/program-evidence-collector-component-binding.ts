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

/** Whether a view of a component's props holds this field. */
type PropsFields = (field: string) => boolean;

type ComponentPropReceiver = {
  node: TypeScript.Node;
  elementId: string;
  parameterId: string;
  parameter: TypeScript.ParameterDeclaration;
};

/** Collect exact JSX-to-component parameter member evidence after node facts exist. */
export class ProgramEvidenceCollectorComponentBindingSupport extends ProgramEvidenceCollectorBoundaryProcessing {
  protected readonly pendingComponentPropBindings: PendingComponentPropBinding[] = [];
  protected readonly componentPropBindings: PendingComponentPropBinding[] = [];

  protected queueComponentPropBinding(
    opening: TypeScript.JsxOpeningLikeElement,
    attribute: TypeScript.JsxAttribute,
    valueId: string,
    occurrenceId: string,
    ownerId: string | null,
    target: CollectorFunctionInfo,
  ): void {
    this.pendingComponentPropBindings.push({ opening, attribute, valueId, occurrenceId, ownerId, target });
    this.componentPropBindings.push({ opening, attribute, valueId, occurrenceId, ownerId, target });
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
        // `props.label` reads the prop itself; a view's `local.label` reads the field of the same name, when the view holds it.
        && (sameCompilerSymbol(receiver, parameterSymbol) ? sameCompilerSymbol(this.checker.getSymbolAtLocation(node.name), expectedProperty) : views.get(receiver)?.(propName))
      ) {
        this.prepareComponentReceiver(node);
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
   * The bindings in a component that hold a view of its props, each with the
   * fields it holds: a `const` copy holds what its source does, each half of
   * `splitProps(props, keys)` the keys its position names, `mergeProps` what
   * its views hold less a field a later object always sets, and a call that
   * passes its argument through what the argument holds. A field read of a
   * view reads that prop only when the view holds the field.
   */
  private propsViews(declaration: TypeScript.SignatureDeclaration, props: TypeScript.Symbol): Map<TypeScript.Symbol, PropsFields> {
    const views = new Map<TypeScript.Symbol, PropsFields>([[props, () => true]]);
    const fieldsOf = (expression: TypeScript.Expression | undefined) => {
      const value = expression && unwrap(this.ts, expression);
      const symbol = value && this.ts.isIdentifier(value) ? this.checker.getSymbolAtLocation(value) : undefined;
      return symbol ? views.get(symbol) : undefined;
    };
    /** What each name of a declaration holds, by its position in the pattern. */
    const heldBy = (initializer: TypeScript.Expression): ((position: number) => PropsFields) | null => {
      const value = unwrap(this.ts, initializer);
      const copied = fieldsOf(value);
      if (copied) return () => copied;
      if (!this.ts.isCallExpression(value)) return null;
      const imported = importedCallee(this.ts, this.checker, value.expression);
      if (!imported) return null;
      if (imported.module === "solid-js" && imported.name === "splitProps") return this.splitFields(value, fieldsOf(value.arguments[0]));
      const passes = frameworkFlow(imported.module, imported.name)?.passes;
      if (!passes) return null;
      const merges = imported.module === "solid-js" && imported.name === "mergeProps";
      const held = value.arguments.flatMap((argument, index): PropsFields[] => {
        const fields = passes === "*" || passes.includes(index) ? fieldsOf(argument) : undefined;
        if (!fields) return [];
        const later = merges ? value.arguments.slice(index + 1) : [];
        return [(field) => fields(field) && !later.some((source) => this.alwaysSets(source, field))];
      });
      return held.length ? () => (field) => held.some((fields) => fields(field)) : null;
    };
    // In source order, so a view built from an earlier view is found in one pass.
    const visit = (node: TypeScript.Node) => {
      if (this.ts.isVariableDeclaration(node) && node.initializer) {
        const held = heldBy(node.initializer);
        const names = this.ts.isIdentifier(node.name) ? [node.name] : this.ts.isArrayBindingPattern(node.name) ? node.name.elements.map((item) => (this.ts.isBindingElement(item) && this.ts.isIdentifier(item.name) ? item.name : null)) : [];
        names.forEach((name, position) => {
          const symbol = name ? this.checker.getSymbolAtLocation(name) : undefined;
          if (held && symbol) views.set(symbol, held(position));
        });
      }
      this.ts.forEachChild(node, visit);
    };
    const body = (declaration as { body?: TypeScript.Node }).body;
    if (body) visit(body);
    return views;
  }

  /** The fields each result of `splitProps(view, ...keys)` holds: one group of keys per position, and the rest last. A key list the code computes keeps every field. */
  private splitFields(call: TypeScript.CallExpression, view: PropsFields | undefined): ((position: number) => PropsFields) | null {
    if (!view) return null;
    const groups = call.arguments.slice(1).map((group) => {
      const keys = unwrap(this.ts, group);
      if (!this.ts.isArrayLiteralExpression(keys) || !keys.elements.every((key) => this.ts.isStringLiteralLike(key))) return null;
      return new Set(keys.elements.map((key) => (key as TypeScript.StringLiteralLike).text));
    });
    if (groups.includes(null)) return () => view;
    return (position) => (field) => view(field) && (position < groups.length ? groups[position]!.has(field) : !groups.some((group) => group!.has(field)));
  }

  /** Whether a `mergeProps` source is an object that sets this field to a value that cannot be undefined. */
  private alwaysSets(source: TypeScript.Expression, field: string): boolean {
    const object = unwrap(this.ts, source);
    if (!this.ts.isObjectLiteralExpression(object)) return false;
    return object.properties.some((property) => {
      if (!this.ts.isPropertyAssignment(property) && !this.ts.isShorthandPropertyAssignment(property)) return false;
      if (!this.ts.isIdentifier(property.name) && !this.ts.isStringLiteralLike(property.name) || property.name.text !== field) return false;
      const value = this.ts.isPropertyAssignment(property) ? unwrap(this.ts, property.initializer) : property.name;
      // With `strictNullChecks` off a type never says `undefined`, so only a literal is sure to be there.
      if (!this.strictNulls) return this.ts.isLiteralExpression(value) || value.kind === this.ts.SyntaxKind.TrueKeyword || value.kind === this.ts.SyntaxKind.FalseKeyword;
      const type = this.checker.getTypeAtLocation(value);
      const parts = type.isUnion() ? type.types : [type];
      return parts.every((part) => !(part.flags & (this.ts.TypeFlags.Undefined | this.ts.TypeFlags.Any | this.ts.TypeFlags.Unknown)));
    });
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
