import ts from "typescript";
import type { Compiler } from "./typescript";
import { identifier, locate, Refusal, topNames } from "./symbols";

export type MachineAction = { kind: "state-machine"; file: string; name: string; to: string };

/** Interpret a deliberately finite, pure grammar; never evaluate project code. */
export function stateMachine(ctx: Compiler, action: MachineAction) {
  const target = locate(ctx, action.file, action.name);
  const fn = target.declaration;
  identifier(action.to);
  const fail = (message: string): never => { throw new Refusal("machine-proof-required", message); };
  if (!ts.isFunctionDeclaration(fn) || !fn.body || fn.parameters.length !== 2 || fn.typeParameters || fn.asteriskToken || fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return fail("Select a synchronous function with exactly two typed parameters: state and event.");
  if (topNames(target.source).some((item) => item.name.text === action.to)) return fail("The transition-table name already exists in this module.");
  const [state, event] = fn.parameters;
  if (![state, event].every((p) => ts.isIdentifier(p.name) && p.type && !p.initializer && !p.questionToken && !p.dotDotDotToken)) return fail("State and event must be required identifier parameters with explicit finite string types.");
  const checker = ctx.program.getTypeChecker();
  const domain = (parameter: ts.ParameterDeclaration): string[] => {
    const type = checker.getTypeAtLocation(parameter);
    const types = type.isUnion() ? type.types : [type];
    if (types.some((item) => !item.isStringLiteral()) || types.length > 32) return fail("Each parameter must have a finite union of at most 32 string literals.");
    return types.map((item) => (item as ts.StringLiteralType).value).sort();
  };
  const states = domain(state), events = domain(event);
  if ([...states, ...events].includes("__proto__") && (ctx.program.getCompilerOptions().target ?? ts.ScriptTarget.ES5) < ts.ScriptTarget.ES2015) return fail("The __proto__ key requires an ES2015+ emit target so computed properties retain data-property semantics.");
  const stateName = state.name.getText(), eventName = event.name.getText();
  function value(node: ts.Expression, current: string, input: string): string | boolean {
    if (ts.isParenthesizedExpression(node)) return value(node.expression, current, input);
    if (ts.isStringLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node) && node.text === stateName) return current;
    if (ts.isIdentifier(node) && node.text === eventName) return input;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return !value(node.operand, current, input);
    if (ts.isBinaryExpression(node)) {
      // Evaluate both sides so unsupported syntax is refused even in a dead arm.
      const left = value(node.left, current, input), right = value(node.right, current, input);
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.EqualsEqualsEqualsToken: return left === right;
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: return left !== right;
        case ts.SyntaxKind.AmpersandAmpersandToken: return Boolean(left && right);
        case ts.SyntaxKind.BarBarToken: return Boolean(left || right);
      }
    }
    return fail(`Cannot prove guard/return ${JSON.stringify(node.getText())}. Only state/event, string literals, strict comparisons and boolean guards are supported.`);
  }
  function evaluate(statement: ts.Statement, current: string, input: string, validate = false): string | undefined {
    if (ts.isBlock(statement)) {
      let result: string | undefined;
      for (const child of statement.statements) {
        if (result === undefined || validate) { const next = evaluate(child, current, input, validate); result ??= next; }
      }
      return result;
    }
    if (ts.isIfStatement(statement)) {
      const condition = value(statement.expression, current, input);
      if (validate) { evaluate(statement.thenStatement, current, input, true); if (statement.elseStatement) evaluate(statement.elseStatement, current, input, true); }
      return condition ? evaluate(statement.thenStatement, current, input) : statement.elseStatement ? evaluate(statement.elseStatement, current, input) : undefined;
    }
    if (ts.isReturnStatement(statement) && statement.expression) {
      const result = value(statement.expression, current, input);
      if (typeof result !== "string" || !states.includes(result)) return fail("Every return must resolve to a member of the state domain.");
      return result;
    }
    if (ts.isEmptyStatement(statement)) return undefined;
    return fail(`Effects and arbitrary statements need an explicit effect model: ${statement.getText()}`);
  }
  // Walk every branch, including unreachable ones, before constructing the table.
  evaluate(fn.body, states[0], events[0], true);
  const transitions = states.flatMap((from) => events.map((input) => {
    const to = evaluate(fn.body!, from, input);
    if (to === undefined) return fail(`Missing return for state ${JSON.stringify(from)}, event ${JSON.stringify(input)}.`);
    return { from, event: input, to };
  }));
  const rows = states.map((from) => `  [${JSON.stringify(from)}]: { ${transitions.filter((item) => item.from === from).map((item) => `[${JSON.stringify(item.event)}]: ${JSON.stringify(item.to)}`).join(", ")} }`).join(",\n");
  if ([stateName, eventName].includes(action.to)) return fail("The table name must differ from both parameters.");
  // Keep initialization inside the function, preserving calls before its declaration and cycles.
  const table = `const ${action.to}: Record<${state.type!.getText()}, Record<${event.type!.getText()}, ${state.type!.getText()}>> = {\n${rows}\n};`;
  return { machine: { states, events, transitions, proof: `${transitions.length} state/event pairs exhaustively evaluated; pure branches, original priority preserved.` }, changes: ctx.changes([{ fileName: target.source.fileName, textChanges: [
    { span: { start: fn.body.getStart(), length: fn.body.getWidth() }, newText: `{\n  ${table}\n  return ${action.to}[${stateName}][${eventName}];\n}` },
  ] }]) };
}
