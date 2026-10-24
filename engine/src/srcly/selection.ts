import path from "node:path";
import type * as TypeScript from "typescript";
import { EngineError } from "./protocol";
import type { TsTier1 } from "./session";

/** 1-based lines, 1-based UTF-16 columns, exclusive end column (plan section 3.5). */
export type Span = { startLine: number; startColumn: number; endLine: number; endColumn: number };

export type Candidate = { node: TypeScript.Node; kind: string; text: string; span: Span };

/** Expression kinds a value-flow selection may name (plan section 6-M3). */
export function isSupported(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  // `name` in `props.node.name` is a property name, not a value of its own.
  if (ts.isIdentifier(node) && node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return false;
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isJsxExpression(node)) return true;
  if (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node) || ts.isConditionalExpression(node)) return true;
  if (ts.isElementAccessExpression(node)) return ts.isLiteralExpression(node.argumentExpression);
  if (ts.isCallExpression(node)) return true;
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    return op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken;
  }
  return false;
}

export function spanOf(sourceFile: TypeScript.SourceFile, node: TypeScript.Node): Span {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { startLine: start.line + 1, startColumn: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 };
}

export function sameSpan(a: Span, b: Span) {
  return a.startLine === b.startLine && a.startColumn === b.startColumn && a.endLine === b.endLine && a.endColumn === b.endColumn;
}

/** The Program's source file for a path relative to the engine root (or absolute inside it). */
export function sourceFileFor(tier1: TsTier1, file: unknown): { sourceFile: TypeScript.SourceFile; relative: string; absolute: string } {
  if (typeof file !== "string" || !file) throw new EngineError("invalid-request", "params.file is required");
  const root = path.resolve(tier1.args.root);
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new EngineError("invalid-request", `${file} is outside the engine root`);
  const sourceFile = tier1.program.getSourceFile(absolute);
  if (!sourceFile) throw new EngineError("not-found", `${relative} is not in the TypeScript program`);
  return { sourceFile, relative: relative.split(path.sep).join("/"), absolute };
}

export function parseSpan(value: unknown): Span {
  const span = value as Partial<Span> | null;
  const ok = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
  if (!span || !ok(span.startLine) || !ok(span.startColumn) || !ok(span.endLine) || !ok(span.endColumn)) {
    throw new EngineError("invalid-request", "params.span needs positive startLine, startColumn, endLine and endColumn");
  }
  return span as Span;
}

/**
 * The supported expressions at a span, innermost first: the smallest node
 * covering it and its supported ancestors. A range selection keeps only the
 * candidates whose text equals the selected text, so shared source spans in
 * different call contexts never merge.
 */
export function candidatesAt(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile, span: Span, text?: string | null): Candidate[] {
  const toPos = (line: number, column: number) => {
    const lines = sourceFile.getLineStarts();
    if (line - 1 >= lines.length) throw new EngineError("invalid-request", `Line ${line} is past the end of ${sourceFile.fileName}`);
    return sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
  };
  const start = toPos(span.startLine, span.startColumn);
  const end = Math.max(start, toPos(span.endLine, span.endColumn));
  let innermost: TypeScript.Node = sourceFile;
  const descend = (node: TypeScript.Node) => {
    ts.forEachChild(node, (child) => {
      if (child.getStart(sourceFile) <= start && end <= child.getEnd() && (end > start || start < child.getEnd())) {
        innermost = child;
        descend(child);
      }
    });
  };
  descend(sourceFile);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (let node: TypeScript.Node | undefined = innermost; node && node !== sourceFile; node = node.parent) {
    if (ts.isStatement(node) || ts.isFunctionLike(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) break;
    if (!isSupported(ts, node)) continue;
    const nodeText = node.getText(sourceFile);
    const nodeSpan = spanOf(sourceFile, node);
    const key = `${nodeSpan.startLine}:${nodeSpan.startColumn}:${nodeSpan.endLine}:${nodeSpan.endColumn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ node, kind: ts.SyntaxKind[node.kind], text: nodeText, span: nodeSpan });
  }
  const selected = text && text.trim() ? out.filter((candidate) => candidate.text === text.trim()) : out;
  return selected;
}
