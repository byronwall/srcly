// What a `slot` row says a JSX component does with its props
// (`engine/models/*.json`, migration stage 4 in
// docs/research/dataflow-library-models-2026-11): which function it calls
// and with what. `Argument[0]` is the props, so `<For each>` is
// `Argument[0].Member[each].ArrayElement -> Argument[0].Member[children].Parameter[0]`.
import type * as TypeScript from "typescript";
import { LIBRARY_FLOW_PATTERN, type LibraryModelRow } from "./library-models";
import { rowPaths, type Flow } from "./framework-flows";
import type { ProgramProofKind } from "./program-evidence";
import { PROOF_TRAITS } from "../srcly/kinds";

/**
 * One function the component calls: the attribute whose value fills a
 * parameter (`input`, each element of it when `element`), the attribute
 * that holds the function (`render`, `children` for the element's child),
 * the parameter, and whether the parameter is an accessor of the value
 * (`accessor`: its calls read it) rather than the value.
 */
export type SlotCall = { input: string; element: boolean; render: string; parameter: number; accessor: boolean };

const prop = (path: string) => /^Argument\[0\]\.Member\[(\w+)\]/.exec(path)?.[1];

function callOf(flow: Flow): SlotCall | null {
  const from = /^Argument\[0\]\.Member\[(\w+)\](\.ArrayElement)?$/.exec(flow.from);
  const to = /^Argument\[0\]\.Member\[(\w+)\]\.Parameter\[(\d+)\](\.ReturnValue)?$/.exec(flow.to);
  if (flow.test || !from || !to) return null;
  return { input: from[1], element: Boolean(from[2]), render: to[1], parameter: Number(to[2]), accessor: Boolean(to[3]) };
}

const variantPaths = new WeakMap<LibraryModelRow, Flow[]>();

function variantFlows(row: LibraryModelRow): Flow[] {
  let flows = variantPaths.get(row);
  if (!flows) {
    flows = (row.variant?.flows ?? []).map((flow) => {
      const match = LIBRARY_FLOW_PATTERN.exec(flow)!;
      return { from: match[1], to: match[2], test: match[3] === "test" };
    });
    variantPaths.set(row, flows);
  }
  return flows;
}

/** The row when it is a `slot`, else null. */
export function slotRow(row: LibraryModelRow | null): LibraryModelRow | null {
  return row?.model === "slot" ? row : null;
}

/**
 * The flows that hold at one occurrence: the variant's when the occurrence
 * sets its attribute (`keyed`, `keyed={true}`), the row's when it leaves it
 * out or sets it `{false}`, and null when its value is anything else.
 */
export function occurrenceFlows(ts: typeof TypeScript, row: LibraryModelRow, opening: TypeScript.JsxOpeningLikeElement): Flow[] | null {
  if (!row.variant) return rowPaths(row);
  let set: boolean | null = false;
  for (const property of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) return null;
    if (!ts.isIdentifier(property.name) || property.name.text !== row.variant.attribute) continue;
    const value = property.initializer && ts.isJsxExpression(property.initializer) ? property.initializer.expression : property.initializer;
    set = !value ? true
      : value.kind === ts.SyntaxKind.TrueKeyword ? true
        : value.kind === ts.SyntaxKind.FalseKeyword ? false : null;
  }
  return set === null ? null : set ? variantFlows(row) : rowPaths(row);
}

/** The functions the component calls with values from its props. */
export function slotCalls(flows: readonly Flow[]): SlotCall[] {
  return flows.flatMap((flow) => callOf(flow) ?? []);
}

/** The attribute that names the component a `<Dynamic>` renders: the one whose first parameter takes the props. */
export function renderedProp(row: LibraryModelRow | null): string | null {
  if (!slotRow(row)) return null;
  for (const flow of rowPaths(row)) {
    const to = /^Argument\[0\]\.Member\[(\w+)\]\.Parameter\[0\]$/.exec(flow.to);
    if (flow.from === "Argument[0]" && to) return to[1];
  }
  return null;
}

/** Whether the component renders a test of this attribute (`<Show when>`): it decides a branch. */
export function testsProp(row: LibraryModelRow | null, attribute: string): boolean {
  return Boolean(slotRow(row)) && [...rowPaths(row), ...variantFlows(row!)].some((flow) => flow.test && prop(flow.from) === attribute);
}

/**
 * Whether the component keeps this attribute's value from the page: it hands
 * it to a function it calls (`each`), or it calls it (`ErrorBoundary`'s
 * `fallback`), in any variant.
 */
export function handsProp(row: LibraryModelRow | null, attribute: string): boolean {
  if (!slotRow(row)) return false;
  const flows = [...rowPaths(row), ...variantFlows(row!)];
  const called = (path: string) => prop(path) === attribute && /^Argument\[0\]\.Member\[\w+\]\.(Parameter|ReturnValue)/.test(path);
  return flows.some((flow) => callOf(flow)?.input === attribute || called(flow.from) || called(flow.to))
    || (row!.makes ?? []).some(called);
}

/**
 * The proof kinds a slot call's relations carry, from the row's `proof`
 * (`solid-for`: `solid-for-binding`, `solid-for-each`,
 * `solid-for-render-parameter`), so route totality still matches them. Null
 * when the row names none or one is not a `PROOF_TRAITS` kind.
 */
export function slotProofs(row: LibraryModelRow, call: SlotCall): { binding: ProgramProofKind; input: ProgramProofKind; parameter: ProgramProofKind } | null {
  if (!row.proof) return null;
  const kinds = { binding: `${row.proof}-binding`, input: `${row.proof}-${call.input}`, parameter: `${row.proof}-render-parameter` };
  return Object.values(kinds).every((kind) => kind in PROOF_TRAITS) ? kinds as { binding: ProgramProofKind; input: ProgramProofKind; parameter: ProgramProofKind } : null;
}

/**
 * Whether this name is a parameter a slot fills with an accessor (`<Show when>{(doc) => …}`
 * without `keyed`, `<Index>`'s item): the name is a function, so its own fields (`doc.length`,
 * its arity) are not the value's. Only an inline function child counts.
 */
export function isSlotAccessor(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  modelFor: (node: TypeScript.Node) => LibraryModelRow | null,
  name: TypeScript.Identifier,
): boolean {
  const declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
  if (!declaration || !ts.isParameter(declaration)) return false;
  const render = declaration.parent;
  let holder: TypeScript.Node = render.parent;
  while (ts.isParenthesizedExpression(holder)) holder = holder.parent;
  if (!(ts.isArrowFunction(render) || ts.isFunctionExpression(render)) || !ts.isJsxExpression(holder) || !ts.isJsxElement(holder.parent)) return false;
  const opening = holder.parent.openingElement;
  const row = slotRow(modelFor(opening.tagName));
  const flows = row ? occurrenceFlows(ts, row, opening) : null;
  const at = render.parameters.indexOf(declaration);
  return Boolean(flows && slotCalls(flows).some((call) => call.render === "children" && call.parameter === at && call.accessor));
}
