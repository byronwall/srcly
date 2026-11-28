import { For } from 'solid-js';
import catalog from './data/catalog.json';

type Metric = (typeof catalog.metrics)[number];

const LANGUAGES: Record<string, string> = { ts: 'TS', tsx: 'TSX', js: 'JS', jsx: 'JSX', python: 'Python', code: 'other code', markdown: 'Markdown' };

function languages(metric: Metric) {
  const ids = metric.languages ?? [];
  if (!ids.length) return 'any file';
  const names = ids.filter(id => !(id === 'js' && ids.includes('ts')) && !(id === 'jsx' && ids.includes('tsx'))).map(id => {
    if (id === 'ts' && ids.includes('js')) return 'TS/JS';
    if (id === 'tsx' && ids.includes('jsx')) return 'TSX/JSX';
    return LANGUAGES[id] ?? id;
  });
  return names.join(', ');
}

/** The catalog writes code in backticks; show it as code. */
function ticks(text: string) {
  return text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code>{part}</code> : part));
}

function rollup(metric: Metric) {
  if (metric.aggregation === 'max') return metric.witness ? 'max, named' : 'max';
  if (metric.aggregation === 'mean') return 'average';
  return 'sum';
}

const analyzers: [string, string, string][] = [
  ['TypeScript, TSX, JavaScript, JSX', 'tree-sitter (JS parses with the TSX grammar)', 'Functions and nested scopes, complexity, cognitive complexity, nesting, comment noise, React and Solid components, TS escapes'],
  ['Python', 'tree-sitter', 'Functions, classes and nested scopes, complexity, cognitive complexity, nesting, comment noise'],
  ['CSS, SCSS', 'tree-sitter', 'Each rule and at-rule block as a scope'],
  ['Markdown', 'tree-sitter', 'Heading sections, code blocks and block quotes as scopes, data URL count'],
  ['Jupyter notebooks', 'Srcly\'s notebook reader', 'Each cell as a scope; LOC counts cell source, never outputs'],
  ['Go, Java, C, C++, C#, PHP and the rest Lizard reads', 'Lizard', 'Functions, complexity, parameters'],
  ['YAML, shell, HTML and other text', 'line count only', 'LOC and size; other metrics are N/A'],
];

const checkers: [string, string][] = [
  ['tsc', 'The project\'s own tsc --noEmit for each tsconfig, when node_modules/.bin has it'],
  ['eslint', 'The project\'s eslint and its config, when it has both'],
  ['ruff', 'Bundled with Srcly. Uses the project\'s ruff config, or bug-finding rules (E9, E722, F, B, PLE) labelled "srcly defaults"'],
  ['srcly TS rules', 'TS files no project tool covers: explicit any, @ts-ignore without a reason, @ts-nocheck, chains of non-null assertions'],
  ['srcly reachability', 'Unreachable files and unused exports, walking imports from detected entries'],
  ['srcly Solid rules, await-in-loop', 'Solid cleanups returned from onMount or createEffect, and await inside a loop'],
  ['srcly duplicate types', 'A local object type that copies a type another file exports (fields matched by name and type)'],
  ['srcly copied-type casts', 'A cast onto a type with the same name as the operand\'s type but another declaration (type-checked, per tsconfig)'],
  ['ast-grep', 'Your own YAML rules in .srcly/rules/'],
];

const env: [string, string][] = [
  ['SRCLY_CACHE_DIR', 'Where scans are saved. Default: ~/Library/Caches/srcly on macOS, ~/.cache/srcly on Linux, %LOCALAPPDATA%\\srcly\\Cache on Windows'],
  ['SRCLY_NODE', 'The Node.js 18+ binary for data flow. Default: node on PATH'],
  ['SRCLY_FINDINGS_TIMEOUT', 'Seconds each checker may run (default 120 for tsc and eslint, 60 for the rest)'],
  ['SRCLY_DATAFLOW_TIMEOUT', 'Overrides every data-flow request timeout'],
  ['SRCLY_AST_GREP', 'The ast-grep binary, ahead of the project\'s and PATH'],
];

export function Reference(props: { doc: (slug: string) => string }) {
  const groups = catalog.groups.map(group => ({ ...group, metrics: catalog.metrics.filter(metric => metric.group === group.id) }));
  return <div class="reference">
    <section class="ref-block ref-metrics" aria-labelledby="ref-metrics">
      <h3 id="ref-metrics">Metrics</h3>
      <p>Rollup is how a folder or file combines its children. <i>Max, named</i> also names the function or component that sets it. <a href={props.doc('metrics')}>How to read a metric</a></p>
      <div class="table-scroll">
        <table class="table metrics">
          <thead><tr><th>Metric</th><th>Rollup</th><th>Languages</th><th>What it measures</th></tr></thead>
          <For each={groups}>{group => <tbody>
            <tr class="group-row"><th colspan="4">{group.id} <span>{group.description}</span></th></tr>
            <For each={group.metrics}>{metric => <tr id={`metric-${metric.id}`}>
              <td class="metric-name">{metric.label}</td>
              <td>{rollup(metric)}</td>
              <td>{languages(metric)}</td>
              <td>{ticks(metric.description)}</td>
            </tr>}</For>
          </tbody>}</For>
        </table>
      </div>
    </section>

    <section class="ref-block" aria-labelledby="ref-languages">
      <h3 id="ref-languages">Languages and analyzers</h3>
      <p>Srcly picks an analyzer by file extension. Each file runs in a worker process with a hard timeout, so one bad file can't stop the scan. Git-ignored files and folders such as <code>node_modules</code> and <code>dist</code> are skipped.</p>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Files</th><th>Analyzer</th><th>What it adds</th></tr></thead>
          <tbody><For each={analyzers}>{([files, tool, adds]) => <tr><td>{files}</td><td>{tool}</td><td>{adds}</td></tr>}</For></tbody>
        </table>
      </div>
    </section>

    <section class="ref-block" aria-labelledby="ref-findings">
      <h3 id="ref-findings">Findings checkers</h3>
      <p>Checkers run in the background beside the scan, with no setup. A checker that is missing, fails or times out leaves its files N/A with the reason. <a href={props.doc('findings')}>Findings guide</a></p>
      <table class="table">
        <tbody><For each={checkers}>{([tool, text]) => <tr><td><code>{tool}</code></td><td>{text}</td></tr>}</For></tbody>
      </table>
    </section>

    <section class="ref-block" aria-labelledby="ref-config">
      <h3 id="ref-config">Configuration</h3>
      <p>Most projects need none. Two files at the Git root change what Srcly checks. <a href={props.doc('configuration')}>Configuration guide</a></p>
      <pre><code>{'# srcly.toml: extra entry points for reachability\n[reachability]\nentries = ["app/scripts/**/*.ts"]\n\n# .srcly/rules/*.yml: ast-grep rules reported beside tsc, eslint and ruff'}</code></pre>
      <table class="table env">
        <tbody><For each={env}>{([name, text]) => <tr><td><code>{name}</code></td><td>{text}</td></tr>}</For></tbody>
      </table>
    </section>
  </div>;
}
