import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "tmp/**", "examples/bad-ish-solid/**", "examples/pattern-catalog/**", "examples/value-flow-js/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx,mts}"],
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
    },
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        window: "readonly",
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        MouseEvent: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // Static-analysis classifiers are intentionally branch-heavy. Keep a
      // ceiling that catches accidental runaway growth without rejecting the
      // domain decision tables already covered by focused tests.
      complexity: ["error", 80],
      "import/first": "error",
      // Off while the data-flow gap work moves fast; file length is cleaned up later.
      "max-lines": "off",
      "unused-imports/no-unused-imports": "error",
      "no-unassigned-vars": "off",
      "no-useless-assignment": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSImportType",
          message: "Use a type-only import declaration at the top of the file instead of an inline import type.",
        },
        {
          selector: "ImportExpression",
          message: "Use an import declaration at the top of the file instead of a dynamic import.",
        },
        {
          selector: "ImportDeclaration[source.value=/^\\..*\\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/]",
          message: "Use extensionless local import specifiers; the server bundler resolves source files.",
        },
        {
          selector: "ExportNamedDeclaration[source]",
          message: "Import directly from the defining module instead of re-exporting through an intermediary.",
        },
        {
          selector: "ExportAllDeclaration",
          message: "Import directly from the defining module instead of creating a barrel export.",
        },
        {
          selector: "ExportNamedDeclaration[declaration=null]",
          message: "Export declarations where symbols are defined; do not forward imported symbols through another module.",
        },
      ],
    },
  },
  {
    // The ledger is the anchor graph laid out as rows (docs/dataflow-engine.md, "One answer per expression").
    // Its own slice walk and its copies of the graph's stop rules drifted from the graph: keep both out.
    files: ["src/srcly/ops/value-flow.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["**/analysis/evidence-slice", "**/anchor-slice"], message: "The ledger never walks a slice of its own: lay out anchorGraphOp's result." }],
        paths: [{
          name: "../facts",
          importNames: ["naturalEnd", "endsInPlace", "externalCallee", "assumedCallee", "needsOneCallSite", "pairedInSlice", "isNaturalStart", "beginsHere"],
          message: "Where a value ends or stops is decided in anchor-graph.ts only; the ledger reads it from the graph.",
        }],
      }],
    },
  },
  {
    files: ["**/*.d.mts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
