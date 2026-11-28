import path from "node:path";
import { createEngineSession, requireTypescript } from "../src/srcly/session";

// M0 spike (docs/intent/checker-symbol-index): bind every identifier with the
// checker and measure time, heap and result size.
//   node --expose-gc --max-old-space-size=4096 --import tsx scripts/symbol-refs-spike.ts --root <repo>
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const root = path.resolve(args.get("root") ?? ".");
const gc = (globalThis as { gc?: () => void }).gc!;
const mb = (n: number) => Math.round(n / 1024 / 1024);
const heap = () => {
  gc();
  return mb(process.memoryUsage().heapUsed);
};

const t0 = Date.now();
const session = createEngineSession({ root, source: ".", tsconfig: null, typescriptFrom: root });
const tier1 = requireTypescript(session.tier1(), "spike");
const built = Date.now() - t0;
const heapBuilt = heap();
const { ts, program } = tier1;
const checker = program.getTypeChecker();
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
const files = program.getSourceFiles().filter((f) => !f.isDeclarationFile && !f.fileName.includes("/node_modules/") && !rel(f.fileName).startsWith(".."));

const counts = { identifiers: 0, declNames: 0, bound: 0, unbound: 0, external: 0 };
const out: unknown[] = [];
const t1 = Date.now();
for (const file of files) {
  const refs: unknown[] = [];
  const visit = (node: import("typescript").Node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      counts.identifiers += 1;
      const parent = node.parent as import("typescript").Node & { name?: import("typescript").Node };
      if (parent && parent.name === node && ts.isDeclaration(parent as import("typescript").Node)) {
        counts.declNames += 1;
        return;
      }
      let sym = checker.getSymbolAtLocation(node);
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      const decl = sym?.declarations?.[0];
      const start = file.getLineAndCharacterOfPosition(node.getStart(file));
      if (!decl) {
        counts.unbound += 1;
        refs.push({ l: start.line + 1, c: start.character + 1, u: 1 });
        return;
      }
      const target = decl.getSourceFile();
      const tr = rel(target.fileName);
      if (target.isDeclarationFile || tr.startsWith("..") || target.fileName.includes("/node_modules/")) {
        counts.external += 1;
        return;
      }
      counts.bound += 1;
      const at = target.getLineAndCharacterOfPosition(decl.getStart(target));
      refs.push({ l: start.line + 1, c: start.character + 1, t: [tr, at.line + 1, node.text] });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  out.push({ file: rel(file.fileName), refs });
}
const walked = Date.now() - t1;
const heapWalked = heap();
const json = JSON.stringify(out).length;
console.log(
  JSON.stringify({ root, files: files.length, buildMs: built, walkMs: walked, heapBuiltMB: heapBuilt, heapWalkedMB: heapWalked, rssMB: mb(process.memoryUsage().rss), jsonMB: +(json / 1e6).toFixed(1), ...counts }),
);
