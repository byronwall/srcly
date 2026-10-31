import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompactRelationIndex } from "../../src/analysis/program-evidence-connector-index";
import { ProgramEvidenceCollector } from "../../src/analysis/program-evidence-collector";
import { LazyEvidenceRelationProvider } from "../../src/analysis/evidence-relation-provider";
import { ProgramFactIndex } from "../../src/analysis/program-fact-index";
import { ProgramEvidenceRelationFrontierLoader, relationIndexSink } from "../../src/analysis/program-evidence-relation-loading";
import { createEngineSession, requireTypescript } from "../../src/srcly/session";
import { ENGINE_PACKAGE_DIR } from "../../src/srcly/typescript-choice";

function fixture(guarded = false): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "srcly-demand-http-"));
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", jsx: "preserve", lib: ["ESNext", "DOM"] },
    include: ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
  }));
  const files: Record<string, string> = {
    "src/ambient.d.ts": `declare module "solid-js" { export function createResource<T>(source: unknown, fetcher: () => Promise<T>): [() => T | undefined]; }\n`,
    "src/pages/projects.tsx": [
      `import { createResource as resource } from "solid-js";`,
      `export function Projects() {`,
      `  const [projects] = resource(() => "/api/projects", async () => {`,
      `    const response = await fetch("/api/projects");`,
      `    return await response.json() as { name: string }[];`,
      `  });`,
      `  return projects()?.[0]?.name ?? "";`,
      `}`,
    ].join("\n"),
    ...(guarded ? {
      "src/handlers.ts": [
        `export async function GET(request: Request) {`,
        `  return Response.json([{ name: request.url }]);`,
        `}`,
      ].join("\n"),
      "src/dispatch.ts": [
        `import { GET as loadProjects } from "./handlers.js";`,
        `export function dispatch(request: Request) {`,
        `  const pathname = new URL(request.url).pathname;`,
        `  if (request.method === "GET" && pathname === "/api/projects") return loadProjects(request);`,
        `  return null;`,
        `}`,
      ].join("\n"),
    } : {
      "src/routes/api/projects.ts": [
        `export async function GET() {`,
        `  return Response.json([{ name: "Ada" }]);`,
        `}`,
      ].join("\n"),
    }),
  };
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

describe("on-demand HTTP transport", () => {
  it.each([false, true])( "matches the eager frontier graph for a cross-file fetch, resource, and API response (guarded=%s)", (guarded) => {
    const root = fixture(guarded);
    try {
      const demandSession = createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
      const eagerSession = createEngineSession({ root, source: root, tsconfig: null, typescriptFrom: ENGINE_PACKAGE_DIR });
      const demandTier = requireTypescript(demandSession.tier1(), "demand HTTP evidence");
      const tier = requireTypescript(eagerSession.tier1(), "eager HTTP evidence oracle");
      const relationIndex = new CompactRelationIndex();
      const evidence = new ProgramEvidenceCollector(tier.ts, tier.program, root, {}, relationIndexSink(relationIndex)).collect();
      expect(relationIndex.all().some((relation) => relation.kind === "http-bridge")).toBe(true);
      const facts = new ProgramFactIndex(evidence.elements, evidence.sourceFiles);
      const eagerProvider = new LazyEvidenceRelationProvider(
        facts,
        new ProgramEvidenceRelationFrontierLoader(facts, relationIndex),
        evidence.gaps,
      );
      const responseFile = guarded ? "src/handlers.ts" : "src/routes/api/projects.ts";
      const response = evidence.elements.find((fact) => fact.kind === "http-response" && fact.location.file === responseFile);
      expect(response).toBeDefined();
      const eagerGraph = eagerProvider.getRelations(response!.id, "forward");
      demandTier.provider().facts.fileCandidates(response!.location.file, response!.location.span);
      const demandGraph = demandTier.provider().getRelations(response!.id, "forward");
      expect(eagerGraph.some((edge) => edge.kind === "http-bridge")).toBe(true);
      expect(demandGraph).toEqual(eagerGraph);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
