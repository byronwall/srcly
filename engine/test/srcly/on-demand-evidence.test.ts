import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CompactRelationIndex } from "../../src/analysis/program-evidence-connector-index";
import { ProgramEvidenceCollector } from "../../src/analysis/program-evidence-collector";
import { ProgramFactIndex } from "../../src/analysis/program-fact-index";
import { LazyEvidenceRelationProvider } from "../../src/analysis/evidence-relation-provider";
import { ProgramEvidenceRelationFrontierLoader, relationIndexSink } from "../../src/analysis/program-evidence-relation-loading";
import { anchorGraphOp } from "../../src/srcly/ops/anchor-graph";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-demand-parity-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", jsx: "preserve", lib: ["ESNext", "DOM"] },
    include: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
  }));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

function sessionFor(root: string) {
  return createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
}

function compareWithEager(root: string, query: Record<string, unknown>) {
  const demandSession = sessionFor(root);
  const eagerSession = sessionFor(root);
  const tier = requireTypescript(eagerSession.tier1(), "eager evidence oracle");
  const compactRelations = new CompactRelationIndex();
  const collector = new ProgramEvidenceCollector(tier.ts, tier.program, root, {}, relationIndexSink(compactRelations));
  const evidence = collector.collect();
  const facts = new ProgramFactIndex(evidence.elements, evidence.sourceFiles);
  tier.provider = () => new LazyEvidenceRelationProvider(
    facts,
    new ProgramEvidenceRelationFrontierLoader(facts, compactRelations),
    evidence.gaps,
  );
  return {
    demand: anchorGraphOp(demandSession, query),
    eager: anchorGraphOp(eagerSession, query),
  };
}

function expressionQuery(root: string, file: string, expression: string, direction: string) {
  const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  const line = lines.findIndex((value) => value.includes(expression));
  if (line < 0) throw new Error(`${expression} is not in ${file}`);
  const column = lines[line].indexOf(expression) + 1;
  return {
    file,
    span: { startLine: line + 1, startColumn: column, endLine: line + 1, endColumn: column + expression.length },
    direction,
  };
}

describe("on-demand evidence parity", () => {
  it("matches backward parameter traces through a same-file function alias", () => {
    const aliases = [
      { label: "a const alias", statements: [`const alias = target;`, `export function caller(input: string) { alias(input); }`] },
      { label: "an object property", statements: [`const registry = { save: target };`, `export function caller(input: string) { registry.save(input); }`] },
      { label: "a destructured property", statements: [`const registry = { save: target };`, `const { save: alias } = registry;`, `export function caller(input: string) { alias(input); }`] },
    ];
    for (const { label, statements } of aliases) {
      const root = fixture({
        "index.ts": [`function target(value: string) { console.log(value); }`, ...statements].join("\n"),
      });
      try {
        const { demand, eager } = compareWithEager(root, { file: "index.ts", name: "value", line: 1, direction: "backward" });
        expect(eager.nodes.some((node) => node.label.includes("input")), `${label}: eager trace reaches caller input`).toBe(true);
        expect(demand, label).toEqual(eager);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }, 30_000);

  it("preserves the eager provider's cross-file function-alias frontier", () => {
    const root = fixture({
      "target.ts": `export function target(value: string) { console.log(value); }`,
      "alias.ts": [`import { target as original } from "./target.js";`, `export const alias = original;`].join("\n"),
      "caller.ts": [`import { alias } from "./alias.js";`, `export function caller(input: string) { alias(input); }`].join("\n"),
    });
    try {
      const { demand, eager } = compareWithEager(root, { file: "target.ts", name: "value", line: 1, direction: "backward" });
      expect(eager.nodes.some((node) => node.label.includes("input"))).toBe(false);
      expect(demand.nodes.some((node) => node.label.includes("input"))).toBe(false);
      expect(demand).toEqual(eager);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches eager traces through a mutable module variable", () => {
    const root = fixture({
      "index.ts": [
        `let current = "seed";`,
        `export function write(next: string) { current = next; }`,
        `export function read() { return current; }`,
      ].join("\n"),
    });
    try {
      for (const query of [
        { file: "index.ts", name: "current", line: 3, direction: "backward" },
        { file: "index.ts", name: "current", line: 1, direction: "forward" },
      ]) {
        const { demand, eager } = compareWithEager(root, query);
        expect.soft(demand, query.direction).toEqual(eager);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches eager traces across renamed imports and nested cross-file member writes", () => {
    const root = fixture({
      "shared.ts": `type Card = { label: string }; export const state: { card: Card } = { card: { label: "" } };\n`,
      "writer.ts": `import { state } from "./shared.js";\nexport function write(next: string) { state.card.label = next; }\n`,
      "helper.ts": `export function clean(value: string) { return value.trim(); }\n`,
      "reader.ts": [
        `import { state } from "./shared.js";`,
        `import { clean as normalize } from "./helper.js";`,
        `export function read(input: string) { const saved = state.card.label; return normalize(input + saved); }`,
      ].join("\n"),
    });
    try {
      const memberQueries = [
        [expressionQuery(root, "writer.ts", "next", "forward"), "reader.ts"],
        [expressionQuery(root, "reader.ts", "state.card.label", "backward"), "writer.ts"],
      ] as const;
      for (const [query, counterpart] of memberQueries) {
        const { demand, eager } = compareWithEager(root, query);
        // The eager collector currently does not connect this cross-file member write and read.
        // Keep that limit explicit: demand collection must not invent the missing member-state edge.
        expect(eager.nodes.some((node) => node.file === counterpart && node.label.includes("state.card.label"))).toBe(false);
        expect(demand.nodes.some((node) => node.file === counterpart && node.label.includes("state.card.label"))).toBe(false);
        expect(demand).toEqual(eager);
      }
      const { demand, eager } = compareWithEager(root, expressionQuery(root, "reader.ts", "input", "forward"));
      expect(eager.nodes.some((node) => node.label.includes("normalize"))).toBe(true);
      expect(demand.nodes.some((node) => node.label.includes("normalize"))).toBe(true);
      expect(demand).toEqual(eager);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches eager traces for a cross-file event listener and HTTP request values", () => {
    const root = fixture({
      "receiver.ts": `export function receive(value: string) { console.log(value); }\n`,
      "listener.ts": [
        `import { receive } from "./receiver.js";`,
        `export function listen(input: HTMLInputElement) {`,
        `  input.addEventListener("input", (event) => { receive(event.currentTarget.value); });`,
        `}`,
      ].join("\n"),
      "http.ts": `export async function load(url: string) { return fetch(url).then((response) => response.text()); }\n`,
    });
    try {
      for (const [query, counterpart] of [
        [{ file: "receiver.ts", name: "receive", line: 1, direction: "backward" }, "event"],
        [{ file: "http.ts", name: "load", line: 1, direction: "forward" }, "fetch"],
      ] as const) {
        const { demand, eager } = compareWithEager(root, query);
        expect(eager.nodes.some((node) => node.label.includes(counterpart)), `eager graph should reach ${counterpart}`).toBe(true);
        expect(demand.nodes.some((node) => node.label.includes(counterpart)), `demand graph should reach ${counterpart}`).toBe(true);
        expect(demand).toEqual(eager);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("matches eager traces from a provider to a separate context consumer", () => {
    const root = fixture({
      "solid-js.d.ts": `declare module "solid-js" { export function createContext<T>(value: T): { Provider: (props: { value: T; children?: unknown }) => unknown }; export function useContext<T>(context: { Provider: unknown }): T; }\n`,
      "context.tsx": `import { createContext } from "solid-js"; export const Theme = createContext("");\n`,
      "reader.tsx": `import { useContext } from "solid-js"; import { Theme } from "./context.js"; export function Reader() { const theme = useContext(Theme); return <i>{theme}</i>; }\n`,
      "provider.tsx": `import { Theme } from "./context.js"; export function Provider(props: { value: string }) { return <Theme.Provider value={props.value}><i>provider</i></Theme.Provider>; }\n`,
    });
    try {
      const { demand, eager } = compareWithEager(root, expressionQuery(root, "provider.tsx", "props.value", "forward"));
      expect(demand).toEqual(eager);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not classify unrelated typed declarations before a demanded trace", () => {
    const root = fixture({
      "index.ts": [
        `export function used(input: string) { return input.trim(); }`,
        ...Array.from({ length: 24 }, (_, i) => `function unused${i}(value: { index: ${i} }) { return value.index; }`),
      ].join("\n"),
    });
    try {
      const session = sessionFor(root);
      const tier = requireTypescript(session.tier1(), "demand classification test");
      const checker = tier.program.getTypeChecker();
      const source = tier.program.getSourceFile(path.join(root, "index.ts"))!;
      const unused = source.statements
        .filter((statement) => tier.ts.isFunctionDeclaration(statement) && statement.name?.text.startsWith("unused"));
      const unusedParameters = unused.flatMap((statement) => tier.ts.isFunctionDeclaration(statement) ? statement.parameters : []);
      const unusedTypes = new Set(unusedParameters.map((parameter) => checker.getTypeAtLocation(parameter)));
      const prewarm = vi.spyOn(checker, "getTypeAtLocation");
      const format = vi.spyOn(checker, "typeToString");
      const graph = anchorGraphOp(session, { file: "index.ts", name: "used", line: 1, direction: "forward" });
      expect(graph.outcome).toBe("ok");
      const unusedTypeLookups = prewarm.mock.calls.filter(([node]) => {
        for (let current: typeof node | undefined = node; current; current = current.parent) {
          if (unused.includes(current as (typeof unused)[number])) return true;
        }
        return false;
      });
      expect(unusedTypeLookups).toHaveLength(unusedParameters.length);
      expect(unusedTypeLookups.every(([node]) => tier.ts.isParameter(node))).toBe(true);
      expect(format.mock.calls.filter(([type]) => unusedTypes.has(type))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
