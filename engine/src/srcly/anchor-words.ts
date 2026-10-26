// The words an anchor graph puts on its boxes: an element kind's, and the
// anchor's syntax kind (TypeScript's SyntaxKind names, Python's ast node names).

const KIND_WORDS: Record<string, string> = {
  "field-read": "field read",
  "index-read": "index read",
  "call-result": "call result",
  "jsx-occurrence": "JSX occurrence",
  "component-occurrence": "handed to a component",
  "component-prop-binding": "prop binding",
  "field-consumer": "field consumer",
  "collection-element": "collection element",
  "predicate-result": "predicate",
  "return-expression": "return",
  "for-binding": "For item",
  "show-binding": "Show value",
  "dom-terminal": "DOM attribute",
  "render-terminal": "render slot",
  "resource-input": "resource",
  "resource-result": "resource result",
  "fetch-input": "fetch",
  "file-input": "file read",
  "environment-input": "environment",
  "process-input": "process input",
  "network-request": "network request",
  "external-read": "external read",
  "http-response": "HTTP response",
  "object-pack": "object",
  "type-narrow": "type guard",
  "function-entry": "function",
  "component-definition": "component",
};

export function kindWords(kind: string): string {
  return KIND_WORDS[kind] ?? kind.replaceAll("-", " ");
}

const SYNTAX_WORDS: Record<string, string> = {
  PropertyAccessExpression: "property read",
  Identifier: "name",
  CallExpression: "call",
  BinaryExpression: "fallback",
  ConditionalExpression: "conditional",
  NonNullExpression: "assertion",
  ParenthesizedExpression: "group",
  JsxExpression: "JSX expression",
  ElementAccessExpression: "index read",
  // Python's ast node names.
  Attribute: "attribute read",
  Name: "name",
  Call: "call",
  Subscript: "index read",
  BoolOp: "fallback",
  IfExp: "conditional",
  Await: "await",
  arg: "parameter",
  FunctionDef: "function",
  AsyncFunctionDef: "function",
  ClassDef: "class",
};

export function syntaxWords(kind: string): string {
  return SYNTAX_WORDS[kind] ?? kind;
}

