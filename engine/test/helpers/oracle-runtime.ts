import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { spanOf, type Span } from "../../src/srcly/selection";

// Runs an example root's source under small stand-ins for React and Solid, and
// records the value every marked expression has each time it runs. The
// producer oracle uses it to compare what the engine claims a read sees with
// what the read really sees.
//
// Anything the runtime does not model (a library it has no stand-in for, an
// ambient `declare`, a `.d.ts` module, a host global such as `fetch`) is an
// opaque value: it answers every property, call and `new` with another opaque
// value. A read whose value is opaque tells nothing, and the oracle skips it.
//
// The engine takes the program's own calls as every call a function gets. So
// the runtime calls only the entry points, the exported functions nothing in
// the program references, and lets them call the rest.

export const spanKey = (file: string, span: Span) => `${file}:${span.startLine}:${span.startColumn}:${span.endLine}:${span.endColumn}`;

const OPAQUE = Symbol("opaque");
export const isOpaque = (value: unknown) => (typeof value === "object" || typeof value === "function") && value !== null && (value as Record<symbol, unknown>)[OPAQUE] === true;

function opaque(name: string): unknown {
  const target = function () {} as unknown as object;
  return new Proxy(target, {
    get(_target, key) {
      if (key === OPAQUE) return true;
      // Not a thenable: `await opaque` settles at once.
      if (key === "then") return undefined;
      if (key === Symbol.toPrimitive) return () => `<${name}>`;
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.asyncIterator) return async function* () {};
      if (key === "prototype") return {};
      return opaque(`${name}.${String(key)}`);
    },
    apply: () => opaque(`${name}()`),
    construct: () => opaque(`new ${name}`) as object,
    has: () => false,
  });
}

/** A module object: its own members, and an opaque value for any other name. */
const moduleOf = (name: string, members: Record<string, unknown>) =>
  new Proxy(members, { get: (target, key) => (key in target ? target[key as string] : key === "__esModule" ? true : key === "then" ? undefined : opaque(`${name}.${String(key)}`)) });

const noop = () => {};
const children = (props: Record<string, unknown>) => props.children;
const createContext = (value: unknown) => ({ Provider: children, defaultValue: value });
const useContext = (context: { defaultValue?: unknown }) => context?.defaultValue;
const update = (value: unknown, old: unknown) => (typeof value === "function" ? (value as (old: unknown) => unknown)(old) : value);

/** Solid's `setStore("a", "b", value)`: the last argument is the value, or a function of the old one; an object merges into an object. */
function setPath(target: Record<string, unknown>, args: unknown[]) {
  const keys = args.slice(0, -1) as string[];
  if (!keys.length) {
    const next = update(args[0], target);
    if (next && typeof next === "object") Object.assign(target, next);
    return;
  }
  let holder = target;
  for (const key of keys.slice(0, -1)) holder = holder[key] as Record<string, unknown>;
  const key = keys[keys.length - 1];
  const old = holder[key];
  const next = update(args[args.length - 1], old);
  if (next && typeof next === "object" && !Array.isArray(next) && old && typeof old === "object" && !Array.isArray(old)) Object.assign(old, next);
  else holder[key] = next;
}

const STAND_INS: Record<string, Record<string, unknown>> = {
  react: {
    useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, noop],
    useReducer: (_reducer: unknown, init: unknown, lazy?: (value: unknown) => unknown) => [lazy ? lazy(init) : init, noop],
    useMemo: (make: () => unknown) => make(),
    useCallback: (fn: unknown) => fn,
    useRef: (value: unknown) => ({ current: value }),
    useEffect: noop,
    useLayoutEffect: noop,
    useId: () => "id",
    createContext,
    useContext,
    Fragment: children,
    memo: (component: unknown) => component,
    forwardRef: (render: (props: unknown, ref: unknown) => unknown) => (props: unknown) => render(props, null),
  },
  "solid-js": {
    createSignal: (init: unknown) => {
      let value = init;
      return [() => value, (next: unknown) => (value = update(next, value))];
    },
    createMemo: (make: () => unknown) => {
      const value = make();
      return () => value;
    },
    createEffect: noop,
    createRenderEffect: noop,
    createComputed: noop,
    onMount: noop,
    onCleanup: noop,
    untrack: (fn: () => unknown) => fn(),
    batch: (fn: () => unknown) => fn(),
    createContext,
    useContext,
    mergeProps: (...sources: object[]) => Object.assign({}, ...sources),
    splitProps: (props: Record<string, unknown>, ...groups: string[][]) => [...groups.map((keys) => Object.fromEntries(keys.filter((key) => key in props).map((key) => [key, props[key]]))), Object.fromEntries(Object.entries(props).filter(([key]) => !groups.flat().includes(key)))],
    For: (props: { each?: unknown[]; children: (item: unknown, index: () => number) => unknown }) => props.each?.map((item, index) => props.children(item, () => index)),
    Index: (props: { each?: unknown[]; children: (item: () => unknown, index: number) => unknown }) => props.each?.map((item, index) => props.children(() => item, index)),
    Show: (props: { when: unknown; fallback?: unknown; children: unknown }) => (props.when ? (typeof props.children === "function" ? (props.children as (value: unknown) => unknown)(props.when) : props.children) : props.fallback),
  },
  "solid-js/store": {
    createStore: (init: Record<string, unknown>) => [init, (...args: unknown[]) => setPath(init, args)],
    createMutable: (init: unknown) => init,
  },
};

/** Host globals the code must not reach for real (network, storage, timers, the page, the process): opaque inside the sandbox. */
const SHADOWED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "localStorage", "sessionStorage", "indexedDB", "document", "window", "self", "navigator", "location", "history", "process", "globalThis", "global", "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "console", "crypto", "performance", "Buffer"];

/** Names declared ambiently (`declare function f()`, a global in a `.d.ts`): no code defines them, so they are opaque at run time. */
function ambientNames(files: readonly ts.SourceFile[]) {
  const names = new Set<string>();
  const collect = (statements: readonly ts.Statement[], ambient: boolean) => {
    for (const statement of statements) {
      if (ts.isModuleDeclaration(statement) && statement.name.getText() === "global" && statement.body && ts.isModuleBlock(statement.body)) collect(statement.body.statements, true);
      const declared = ambient || !!ts.getModifiers(statement as ts.HasModifiers)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
      if (!declared) continue;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) names.add(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) names.add(item.name.text);
    }
  };
  // A `.d.ts` with no import or export declares globals.
  for (const file of files) collect(file.statements, file.isDeclarationFile && !ts.isExternalModule(file));
  return names;
}

/** The exported functions nothing in the program references: the code's own callers are all the calls the rest get. */
function entryPoints(program: ts.Program, files: readonly ts.SourceFile[]) {
  const checker = program.getTypeChecker();
  const resolve = (symbol: ts.Symbol | undefined) => (symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const referenced = new Set<ts.Symbol>();
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !ts.isExportSpecifier(node.parent) && !ts.isImportSpecifier(node.parent) && !ts.isImportClause(node.parent) && (node.parent as ts.NamedDeclaration).name !== node) {
        const symbol = resolve(checker.getSymbolAtLocation(node));
        if (symbol) referenced.add(symbol);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const entries = new Map<string, Set<string>>();
  for (const file of files) {
    const moduleSymbol = checker.getSymbolAtLocation(file);
    const names = new Set<string>();
    for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) if (!referenced.has(resolve(exported)!)) names.add(exported.name);
    entries.set(file.fileName, names);
  }
  return entries;
}

const SOURCE = /\.(tsx?|jsx?|mjs|cjs)$/;

/** Every source file under `src`, relative to the root (`src/notes.tsx`). */
export function sourceFiles(root: string) {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE.test(entry.name)) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(root, "src"));
  return out.sort();
}

export type Recorded = Map<string, unknown[]>;

/**
 * Loads every module of the root with the marked spans wrapped in a
 * recorder, then calls each entry point a few ways (an opaque argument, an
 * empty object, nothing), awaiting a promise and draining a generator.
 * Returns what each marked span held each time it ran, and the marked spans
 * no expression matched.
 */
export async function runRoot(root: string, program: ts.Program, marked: Set<string>): Promise<{ recorded: Recorded; unmatched: Set<string> }> {
  const files = sourceFiles(root);
  const parsed = files.map((file) => program.getSourceFile(path.join(root, file))).filter((file): file is ts.SourceFile => !!file);
  const relative = (source: ts.SourceFile) => path.relative(root, source.fileName).split(path.sep).join("/");
  const ambient = [...new Set([...SHADOWED, ...ambientNames(parsed)])];
  const entries = entryPoints(program, parsed);
  const recorded: Recorded = new Map();
  const unmatched = new Set(marked);
  const record = (key: string, value: unknown) => {
    const list = recorded.get(key) ?? recorded.set(key, []).get(key)!;
    if (list.length < 50) list.push(value);
    return value;
  };

  const compiled = new Map<string, string>();
  const entryNames = new Map<string, Set<string>>();
  for (const source of parsed) {
    if (source.isDeclarationFile) continue;
    const file = relative(source);
    entryNames.set(file, entries.get(source.fileName) ?? new Set());
    const instrument: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
      const { factory } = context;
      const wrap = (key: string, value: ts.Expression) => {
        unmatched.delete(key);
        return factory.createCallExpression(factory.createIdentifier("__rec"), undefined, [factory.createStringLiteral(key), value]);
      };
      const visit = (node: ts.Node): ts.Node => {
        // `{ point }` reads `point`: spelled out, its value can be wrapped.
        if (ts.isShorthandPropertyAssignment(node) && !node.objectAssignmentInitializer && marked.has(spanKey(file, spanOf(source, node.name)))) {
          return factory.createPropertyAssignment(node.name.text, wrap(spanKey(file, spanOf(source, node.name)), factory.createIdentifier(node.name.text)));
        }
        const visited = ts.visitEachChild(node, visit, context);
        if (!ts.isExpression(node) || ts.isOmittedExpression(node)) return visited;
        const key = spanKey(file, spanOf(source, node));
        if (!marked.has(key)) return visited;
        // Never wrap a place the code writes to, a callee, or a tag name.
        const parent = node.parent;
        if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return visited;
        if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return visited;
        if (ts.isDeleteExpression(parent) || (ts.isCallExpression(parent) && parent.expression === node) || ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) return visited;
        return wrap(key, visited as ts.Expression);
      };
      return ts.visitNode(sourceFile, visit) as ts.SourceFile;
    };
    // The transform needs the program's own spans, so it runs on that tree before printing.
    const transformed = ts.transform(source, [instrument]).transformed[0];
    const { outputText } = ts.transpileModule(ts.createPrinter().printFile(transformed), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "__h", jsxFragmentFactory: "__F", esModuleInterop: true, allowJs: true },
    });
    compiled.set(file, outputText);
  }

  const h = (type: unknown, props: Record<string, unknown> | null, ...kids: unknown[]) => {
    const all = { ...(props ?? {}) } as Record<string, unknown>;
    if (kids.length) all.children = kids.length === 1 ? kids[0] : kids;
    if (typeof type !== "function") return { type, props: all };
    try {
      return (type as (props: unknown) => unknown)(all);
    } catch {
      return null;
    }
  };

  const cache = new Map<string, Record<string, unknown>>();
  const resolve = (from: string, spec: string) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`]) if (compiled.has(candidate)) return candidate;
    return null;
  };
  const load = (file: string): Record<string, unknown> => {
    if (cache.has(file)) return cache.get(file)!;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(file, module.exports);
    const require = (spec: string) => {
      if (!spec.startsWith(".")) return moduleOf(spec, STAND_INS[spec] ?? {});
      const target = resolve(file, spec);
      return target ? load(target) : moduleOf(spec, {});
    };
    const prelude = ambient.map((name) => `var ${name} = __opaque(${JSON.stringify(name)});`).join("\n");
    try {
      new Function("require", "module", "exports", "__rec", "__h", "__F", "__opaque", `${prelude}\n${compiled.get(file)!.replace(/^"use strict";/, "")}`)(require, module, module.exports, record, h, children, opaque);
    } catch {
      // A module that throws while loading keeps what it exported so far.
    }
    cache.set(file, module.exports);
    return module.exports;
  };

  const settle = async (value: unknown) => {
    if (value && typeof value === "object" && typeof (value as { then?: unknown }).then === "function") {
      await Promise.race([Promise.resolve(value).catch(noop), new Promise((done) => setTimeout(done, 50))]);
      return;
    }
    if (value && typeof value === "object" && typeof (value as Iterator<unknown>).next === "function" && Symbol.iterator in value) {
      try {
        let count = 0;
        for (const _ of value as Iterable<unknown>) if (++count > 50) break;
      } catch {
        // A generator that throws has run its reads already.
      }
    }
  };
  const runAll = async () => {
    for (const file of compiled.keys()) {
      const exported = load(file);
      for (const name of entryNames.get(file) ?? []) {
        const value = exported[name];
        if (typeof value !== "function") continue;
        for (const args of [[opaque("arg")], [{}], []]) {
          try {
            await settle((value as (...args: unknown[]) => unknown)(...args));
          } catch {
            // A call that throws still ran its reads up to the throw.
          }
        }
      }
    }
  };

  // Code the runtime starts may reject after its call returns (a promise nobody awaits): that is the fixture's business, not the test's.
  const listeners = process.rawListeners("unhandledRejection") as ((...args: unknown[]) => void)[];
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", noop);
  try {
    await runAll();
    await new Promise((done) => setTimeout(done, 100));
  } finally {
    process.removeAllListeners("unhandledRejection");
    for (const listener of listeners) process.on("unhandledRejection", listener);
  }
  return { recorded, unmatched };
}
