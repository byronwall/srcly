import * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramElementKind,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramRelationKind,
} from "./program-evidence";
import type {
  CollectorFunctionInfo,
  CollectorReferenceInfo,
} from "./program-evidence-collector-support";
import {
  calleeName,
  derivedOperands,
  isSelectionOperator,
  proof,
  unwrap,
} from "./program-evidence-support";
import { indexReadAttributes } from "./program-index-read-metadata";

type Attributes = Record<string, string | number | boolean | null>;

export function constructorExpressionElementEvidence(
  ts: typeof TypeScript,
  node: TypeScript.NewExpression,
  location: ProgramEvidenceLocation,
): { attributes: Attributes; proof: ProgramProof } {
  return {
    attributes: { callee: `new ${calleeName(ts, node.expression)}` },
    proof: proof(
      "ast-node",
      "The constructor expression is a source-backed invocation occurrence.",
      [location],
    ),
  };
}

export type ProgramEvidenceExpressionContext = {
  ts: typeof TypeScript;
  addReference: (reference: CollectorReferenceInfo) => void;
  parametersBySymbol: ReadonlyMap<string, string>;
  functionsBySymbol: ReadonlyMap<string, CollectorFunctionInfo>;
  symbolId: (node: TypeScript.Node) => string | null;
  /** Whether a property read names an export through a namespace import (`api.load` after `import * as api`). */
  readsNamespace: (node: TypeScript.PropertyAccessExpression) => boolean;
  moduleFor: (node: TypeScript.Node) => string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  ensureElement: (
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Attributes,
    symbolId: string | null,
    module: string | null,
    definitionId: string | null,
    confidence: EvidenceConfidence,
    proofValue: ProgramProof,
    operationKind?: ProgramOperationKind | null,
  ) => string;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
};

export function collectProgramEvidenceExpression(
  context: ProgramEvidenceExpressionContext,
  node: TypeScript.Expression,
  ownerId: string | null,
): string {
  const unwrapped = unwrap(context.ts, node);
  if (context.ts.isNewExpression(unwrapped)) {
    const evidence = constructorExpressionElementEvidence(
      context.ts,
      unwrapped,
      context.location(unwrapped),
    );
    return context.ensureElement(
      unwrapped,
      "call",
      ownerId,
      evidence.attributes,
      context.symbolId(unwrapped.expression),
      context.moduleFor(unwrapped.expression),
      null,
      "proven",
      evidence.proof,
    );
  }
  if (context.ts.isCallExpression(unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "call",
      ownerId,
      { callee: calleeName(context.ts, unwrapped.expression) },
      context.symbolId(unwrapped.expression),
      context.moduleFor(unwrapped.expression),
      null,
      "proven",
      proof(
        "ast-node",
        "The expression is a source-backed invocation occurrence.",
        [context.location(unwrapped)],
      ),
    );
  }
  if (context.ts.isPropertyAccessExpression(unwrapped)) {
    const id = context.ensureElement(
      unwrapped,
      "field-read",
      ownerId,
      { property: unwrapped.name.text },
      context.symbolId(unwrapped.name),
      context.moduleFor(unwrapped.name),
      null,
      "proven",
      proof(
        "property-access",
        "The property access is compiler-backed syntax.",
        [context.location(unwrapped)],
      ),
      "field-read",
    );
    // `api.greeting` reads the export itself, as `greeting` would after a named import.
    if (context.ts.isIdentifier(unwrapped.name) && context.readsNamespace(unwrapped)) context.addReference({ node: unwrapped.name, id, symbolId: context.symbolId(unwrapped.name) });
    return id;
  }
  if (context.ts.isElementAccessExpression(unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "index-read",
      ownerId,
      indexReadAttributes(context.ts, unwrapped),
      context.symbolId(unwrapped.expression),
      null,
      null,
      "proven",
      proof(
        "property-access",
        "The element access is source-backed syntax.",
        [context.location(unwrapped)],
      ),
      "index-read",
    );
  }
  if (
    context.ts.isObjectLiteralExpression(unwrapped) ||
    context.ts.isArrayLiteralExpression(unwrapped)
  ) {
    return context.ensureElement(
      unwrapped,
      "object-pack",
      ownerId,
      objectPackAttributes(context.ts, unwrapped, (item) => context.location(item)),
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The expression packs source-backed values.",
        [context.location(unwrapped)],
      ),
      "object-pack",
    );
  }
  if (
    context.ts.isConditionalExpression(unwrapped) ||
    (context.ts.isBinaryExpression(unwrapped) &&
      isSelectionOperator(context.ts, unwrapped.operatorToken.kind))
  ) {
    const operator = context.ts.isConditionalExpression(unwrapped)
      ? "conditional"
      : unwrapped.operatorToken.getText(unwrapped.getSourceFile());
    return context.ensureElement(
      unwrapped,
      "selection",
      ownerId,
      { operator },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The expression selects between values or branches.",
        [context.location(unwrapped)],
      ),
      "selection",
    );
  }
  if (context.ts.isIdentifier(unwrapped)) {
    const symbolId = context.symbolId(unwrapped);
    const id = context.ensureElement(
      unwrapped,
      "value",
      ownerId,
      { name: unwrapped.text },
      symbolId,
      context.moduleFor(unwrapped),
      null,
      "proven",
      proof(
        symbolId ? "compiler-symbol" : "ast-node",
        "The identifier is a source-backed value occurrence.",
        [context.location(unwrapped)],
      ),
    );
    context.addReference({ node: unwrapped, id, symbolId });
    const parameterId = context.parametersBySymbol.get(symbolId ?? "");
    if (parameterId) {
      context.addRelation(
        parameterId,
        id,
        "references",
        [context.location(unwrapped)],
        proof(
          "compiler-symbol",
          "The value occurrence resolves to a function parameter.",
          [context.location(unwrapped)],
        ),
        "proven",
      );
    }
    const functionTarget = context.functionsBySymbol.get(symbolId ?? "");
    if (functionTarget) {
      context.addRelation(
        id,
        functionTarget.id,
        "definition",
        [context.location(unwrapped)],
        proof(
          "compiler-symbol",
          "The value occurrence resolves to an in-project function.",
          [context.location(unwrapped)],
        ),
        "proven",
      );
    }
    return id;
  }
  if (derivedOperands(context.ts, unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "derived",
      ownerId,
      { text: unwrapped.getText(unwrapped.getSourceFile()) },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The expression derives its value from its operands.",
        [context.location(unwrapped)],
      ),
    );
  }
  return context.ensureElement(
    unwrapped,
    "literal",
    ownerId,
    { text: unwrapped.getText(unwrapped.getSourceFile()) },
    null,
    null,
    null,
    "proven",
    proof(
      "ast-node",
      "The expression is a source-backed literal or value.",
      [context.location(unwrapped)],
    ),
  );
}

/**
 * An object or array literal's attributes. An object literal names the field
 * each property packs, keyed by the property's start (where its `pack-field`
 * relation points), so a slice can enter the pack through the one field it is
 * after (`evidence-slice-fields.ts`). A computed key or a spread names none.
 */
export function objectPackAttributes(
  ts: typeof TypeScript,
  node: TypeScript.ObjectLiteralExpression | TypeScript.ArrayLiteralExpression,
  location: (node: TypeScript.Node) => ProgramEvidenceLocation,
): Record<string, string> {
  if (!ts.isObjectLiteralExpression(node)) return { operation: "object-pack" };
  const fields: Record<string, string> = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    if (ts.isComputedPropertyName(property.name) || ts.isPrivateIdentifier(property.name)) continue;
    const { span } = location(property);
    fields[`${span.startLine}:${span.startColumn}`] = property.name.text;
  }
  return { operation: "object-pack", fields: JSON.stringify(fields) };
}
