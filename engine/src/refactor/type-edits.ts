import ts from "typescript";
import { identifier, locate, Refusal } from "./symbols";
import type { Compiler } from "./typescript";

export type TypeAction = { kind: "add-member" | "update-member" | "remove-member" | "add-type" | "update-type" | "remove-type"; file: string; name?: string; to: string };

function typeDeclaration(text: string) {
  const parsed = ts.createSourceFile("declaration.ts", text, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements[0];
  if (parsed.statements.length !== 1 || (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration))) throw new Refusal("type-declaration-required", "Supply exactly one interface or type alias declaration. Runtime statements are not type edits.");
  return { parsed, declaration };
}

function property(text: string) {
  const { parsed, declaration } = typeDeclaration(`interface Shape { ${text} }`);
  if (!ts.isInterfaceDeclaration(declaration) || declaration.members.length !== 1) throw new Refusal("property-required", "Supply one property declaration, for example title: string or title?: string.");
  const member = declaration.members[0];
  if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name) || !member.type) throw new Refusal("property-required", "Members currently require a named property with an explicit type.");
  return { name: member.name.text, text: member.getText(parsed).replace(/;?$/, ";") };
}

export function editType(ctx: Compiler, action: TypeAction) {
  const file = ctx.inside(action.file).absolute;
  let changes: ts.TextChange[];
  if (action.kind === "add-type") {
    if (!/\.(ts|tsx|mts|cts)$/.test(action.file) || /\.d\.(ts|mts|cts)$/.test(action.file)) throw new Refusal("typescript-source-required", "Add a type to a TypeScript source file in this project.");
    const { declaration } = typeDeclaration(action.to);
    identifier(declaration.name.text);
    const source = ctx.program.getSourceFile(file);
    if (!source && ts.sys.fileExists(file)) throw new Refusal("target-not-in-project", "The existing destination is outside this tsconfig's source files.");
    changes = [{ span: { start: source?.text.length ?? 0, length: 0 }, newText: `\n${action.to.trim()}\n` }];
  } else {
    const target = locate(ctx, action.file, action.name!);
    const declaration = target.declaration;
    if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration)) throw new Refusal("type-target-required", "This operation needs a handle to an interface or type alias.");
    if (action.kind === "remove-type") changes = [{ span: { start: declaration.getStart(target.source), length: declaration.end - declaration.getStart(target.source) }, newText: "" }];
    else if (action.kind === "update-type") {
      const replacement = typeDeclaration(action.to);
      if (replacement.declaration.name.text !== declaration.name.text) throw new Refusal("type-name-mismatch", "Keep the declaration name when updating a type; use rename to change its references.");
      changes = [{ span: { start: declaration.getStart(target.source), length: declaration.end - declaration.getStart(target.source) }, newText: action.to }];
    } else {
      const shape = ts.isInterfaceDeclaration(declaration) ? declaration : ts.isTypeLiteralNode(declaration.type) ? declaration.type : undefined;
      if (!shape) throw new Refusal("object-type-required", "Member edits require an interface or an object type literal. Select a constituent type for unions/intersections.");
      const incoming = action.kind === "remove-member" ? { name: action.to, text: "" } : property(action.to);
      identifier(incoming.name);
      const members = shape.members.filter((member) => member.name && ts.isIdentifier(member.name) && member.name.text === incoming.name);
      if (action.kind === "add-member") {
        if (members.length) throw new Refusal("member-exists", `${incoming.name} already exists; use update-member.`);
        changes = [{ span: { start: shape.end - 1, length: 0 }, newText: `\n  ${incoming.text}\n` }];
      } else {
        if (members.length !== 1) throw new Refusal("member-not-found", `Expected one existing member named ${incoming.name}.`);
        const member = members[0];
        changes = [{ span: { start: member.getStart(target.source), length: member.end - member.getStart(target.source) }, newText: incoming.text }];
      }
    }
  }
  return { changes: ctx.changes([{ fileName: file, textChanges: changes }]), intentionalTypeErrors: true };
}
