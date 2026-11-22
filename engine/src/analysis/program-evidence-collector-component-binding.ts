import * as TypeScript from "typescript";
import type { CollectorFunctionInfo } from "./program-evidence-collector-support";
import { ProgramEvidenceCollectorBoundaryProcessing } from "./program-evidence-collector-boundary-processing";
import { importedCallee, nodeKey, proof, unwrap } from "./program-evidence-support";
import { frameworkFlow, makesAccessor, makesPredicate } from "./framework-flows";
import { stateRoleOf } from "./program-evidence-state-pairs";
import { resolveValue } from "./value-origin";

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
        // `props.count()` where every occurrence binds an accessor: the call reads what the accessor yields, modelled, not a call of unknown code.
        const call = receiver.node.parent;
        const callId = this.ts.isCallExpression(call) && call.expression === receiver.node && call.arguments.length === 0 && this.accessorProp(pending.target, propName) ? this.elementIfPresent(call, "call") : null;
        if (callId) {
          const detail = "Every occurrence of the component binds this prop to an accessor: calling it yields the accessor's value.";
          this.addRelation(receiver.elementId, callId, "accessor-call", [this.location(call)], proof("framework-state", detail, [this.location(call), this.location(pending.attribute)]), "proven");
        }
      }
    }
    this.pendingComponentPropBindings.length = 0;
    this.checkCancellation();
  }

  /**
   * Whether every value the program binds to this component prop is an
   * accessor: a state pair's getter, what an `accessor` row's call makes
   * (`createMemo`), or another component's accessor prop handed on
   * (`value={props.value}`). One occurrence that binds anything else, and a
   * prop nothing binds, is not.
   */
  private accessorProp(target: CollectorFunctionInfo, propName: string, seen = new Set<string>()): boolean {
    const key = `${target.id}#${propName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const bound = this.componentPropBindings.filter((item) => item.target === target && staticPropName(this.ts, item.attribute) === propName);
    return bound.length > 0 && bound.every((item) => {
      const initializer = item.attribute.initializer;
      const value = initializer && this.ts.isJsxExpression(initializer) && initializer.expression ? unwrap(this.ts, initializer.expression) : null;
      if (!value) return false;
      if (stateRoleOf(this.ts, this.checker, value)?.role === "getter") return true;
      const origin = this.ts.isIdentifier(value) ? resolveValue(this.ts, this.checker, value)?.origin : null;
      if (origin && this.ts.isCallExpression(origin)) {
        const made = importedCallee(this.ts, this.checker, origin.expression);
        return !!made && makesAccessor(made.module, made.name) && !makesPredicate(made.module, made.name);
      }
      if (!this.ts.isPropertyAccessExpression(value) || !this.ts.isIdentifier(value.expression)) return false;
      const props = this.checker.getSymbolAtLocation(value.expression)?.valueDeclaration;
      const owner = props && this.ts.isParameter(props) && props.parent.parameters[0] === props ? this.functionsByNode.get(nodeKey(this.root, props.parent)) : undefined;
      return !!owner && this.accessorProp(owner, value.name.text, seen);
    });
  }

  private componentPropReceivers(
    target: CollectorFunctionInfo,
    propName: string,
    seen = new Set<string>(),
  ): ComponentPropReceiver[] {
    const key = `${target.id}#${propName}`;
    if (seen.has(key)) return [];
    seen.add(key);
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
      if (element) return bindingId ? [{ node: element, elementId: bindingId, parameterId: bindingId, parameter }] : [];
    }
    // A destructured parameter's `...rest` holds every prop it does not name: a view of the props, as `props` is.
    const rest = this.ts.isObjectBindingPattern(parameter.name) ? parameter.name.elements.find((item) => item.dotDotDotToken && this.ts.isIdentifier(item.name)) : undefined;
    const name = rest ? rest.name : parameter.name;
    if (!this.ts.isIdentifier(name)) return [];
    const parameterSymbol = this.checker.getSymbolAtLocation(name);
    const parameterId = parameterSymbol
      ? this.parametersBySymbol.get(this.symbolId(name) ?? "") ?? null
      : null;
    if (!parameterSymbol || !parameterId) return [];

    const views = this.propsViews(target.declaration, parameterSymbol);
    const receivers: ComponentPropReceiver[] = [];
    const visit = (node: TypeScript.Node) => {
      this.checkCancellation();
      if (this.ts.isJsxSpreadAttribute(node)) {
        const forwarded = this.spreadReceiver(node, propName, views, target, parameterId, parameter, seen);
        if (forwarded) receivers.push(forwarded);
      }
      const receiver = this.ts.isPropertyAccessExpression(node) && this.ts.isIdentifier(node.expression) ? this.checker.getSymbolAtLocation(node.expression) : undefined;
      if (
        this.ts.isPropertyAccessExpression(node)
        && !node.questionDotToken
        && node.name.text === propName
        && receiver
        // `props.label` reads the prop itself; a view's `local.label` reads the field of the same name, when the view holds it.
        && (sameCompilerSymbol(receiver, parameterSymbol) && !rest ? sameCompilerSymbol(this.checker.getSymbolAtLocation(node.name), expectedProperty) : views.get(receiver)?.(propName))
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

  /** What a JSX opening renders: the in-project components, or an intrinsic element. The JSX collector fills this in. */
  protected openingRenders(_opening: TypeScript.JsxOpeningLikeElement): { targets: CollectorFunctionInfo[]; intrinsic: boolean } {
    return { targets: [], intrinsic: false };
  }

  /**
   * Where a spread of a props view hands a prop on, when the view holds it
   * and no later attribute of the same tag sets it: to an intrinsic
   * element's attributes (`<input {...rest} />`), or into the child
   * component's own receivers for that prop (`<Leaf {...rest} />`), through
   * a binding at the spread. Null for a child the program cannot see, or
   * one that never reads the prop.
   */
  private spreadReceiver(
    spread: TypeScript.JsxSpreadAttribute,
    propName: string,
    views: Map<TypeScript.Symbol, PropsFields>,
    owner: CollectorFunctionInfo,
    parameterId: string,
    parameter: TypeScript.ParameterDeclaration,
    seen: Set<string>,
  ): ComponentPropReceiver | null {
    const value = unwrap(this.ts, spread.expression);
    const symbol = this.ts.isIdentifier(value) ? this.checker.getSymbolAtLocation(value) : undefined;
    if (!symbol || !views.get(symbol)?.(propName)) return null;
    const opening = spread.parent.parent;
    const properties = opening.attributes.properties;
    const later = properties.slice(properties.indexOf(spread) + 1);
    if (later.some((item) => this.ts.isJsxAttribute(item) && this.ts.isIdentifier(item.name) && item.name.text === propName)) return null;
    const rendered = this.openingRenders(opening);
    if (rendered.intrinsic) {
      // The spread's own DOM terminal: every field it holds is an attribute of the element.
      this.elementFor(opening, "jsx-occurrence");
      const terminalId = this.elementIfPresent(spread.expression, "dom-terminal");
      return terminalId ? { node: spread, elementId: terminalId, parameterId, parameter } : null;
    }
    if (!rendered.targets.length) return null;
    const children = rendered.targets.flatMap((child) => this.componentPropReceivers(child, propName, new Set(seen)));
    if (!children.length) return null;
    const occurrenceId = this.elementFor(opening, "component-occurrence");
    const locations = [this.location(spread), ...children.map((child) => this.location(child.node))];
    const forwardId = this.ensureElement(
      spread,
      "component-prop-binding",
      owner.id,
      {
        propName,
        valueMode: null,
        sourceFieldName: propName,
        componentOccurrenceElementId: occurrenceId,
        componentDefinitionId: rendered.targets.length === 1 ? rendered.targets[0].id : null,
        parameterElementId: children[0].parameterId,
        receiverElementId: children[0].elementId,
        candidateCount: children.length,
      },
      null,
      null,
      rendered.targets.length === 1 ? rendered.targets[0].id : null,
      "proven",
      proof("component-prop-binding", "The JSX spread hands on a props view that holds this prop, and no later attribute sets it.", locations),
    );
    for (const child of children) {
      this.addRelation(
        forwardId,
        child.elementId,
        "component-prop-binding",
        [this.location(spread), this.location(child.node)],
        proof("component-prop-binding", "The spread prop reaches the child component's receiver for the same prop.", [this.location(spread), this.location(child.node)]),
        "proven",
      );
    }
    return { node: spread, elementId: forwardId, parameterId, parameter };
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
