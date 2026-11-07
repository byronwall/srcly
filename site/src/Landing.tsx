import { For, createSignal } from 'solid-js';
import { ArrowDownRight, ArrowRight, Check, CircleHelp, Compass, Code2, FileCode2, Layers3 } from 'lucide-solid';

type Metric = 'complexity' | 'comment noise';
type DemoFile = { name: string; loc: number; complexity: number; comments: number; note: string };
const files: DemoFile[] = [
  { name: 'scan.ts', loc: 346, complexity: 21, comments: 4, note: 'Several paths converge here. Start with the largest branches.' },
  { name: 'report.ts', loc: 228, complexity: 13, comments: 2, note: 'A central report module with a few high-complexity functions.' },
  { name: 'cache.ts', loc: 146, complexity: 5, comments: 7, note: 'More commentary than executable code in this sample.' },
  { name: 'tree.ts', loc: 119, complexity: 8, comments: 1, note: 'Small aggregation helpers. Values shown are sample data.' },
  { name: 'schema.ts', loc: 91, complexity: 3, comments: 3, note: 'Type and schema definitions are compact in this sample.' },
  { name: 'paths.ts', loc: 73, complexity: 4, comments: 1, note: 'A small path utility file.' },
  { name: 'format.ts', loc: 54, complexity: 2, comments: 2, note: 'Low measured complexity in this sample.' },
  { name: 'types.ts', loc: 39, complexity: 1, comments: 1, note: 'A few shared types.' },
];

export function Landing(props: { base: string }) {
  const [metric, setMetric] = createSignal<Metric>('complexity');
  const [selected, setSelected] = createSignal(files[0]);
  return <div class="site-shell landing-shell">
    <Header base={props.base}/>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <section class="hero-frame">
        <div class="hero-copy">
          <h1>See where the code gets hard.</h1>
          <p class="hero-deck">Srcly maps a codebase into an explorable view of files, functions, and the signals that matter. Start local. Follow the evidence.</p>
          <div class="hero-actions"><CopyCommand text="uvx srcly"/><a class="button button-primary" href={`${props.base}docs/get-started/`}>Get started <ArrowRight size={16}/></a></div>
          <p class="hero-note">Runs on your machine. No account or upload.</p>
        </div>
        <TreemapDemo metric={metric} setMetric={setMetric} selected={selected} setSelected={setSelected}/>
      </section>
      <section class="how-section" id="explore">
        <div class="section-heading"><h2>A map you can follow.</h2><p>Area shows lines of code. Color shows a selected metric. Click a file to see what the sample contains.</p></div>
        <div class="explore-row"><div class="flow-step"><span class="step-mark"><Layers3 size={18}/></span><div><h3>Start at the whole tree</h3><p>Folders contain files. Files can contain functions and nested scopes. Zoom in when a region needs a closer look.</p></div></div><ArrowDownRight class="flow-arrow" size={23}/><div class="flow-step"><span class="step-mark"><Compass size={18}/></span><div><h3>Compare useful signals</h3><p>Rank hotspots by complexity, size, structure, or supported language signals. A missing measurement stays named as unavailable.</p></div></div><ArrowDownRight class="flow-arrow" size={23}/><div class="flow-step"><span class="step-mark"><FileCode2 size={18}/></span><div><h3>Open the source</h3><p>Inspect a file or function with its metrics and findings in context. Srcly points to code; you decide what to change.</p></div></div></div>
      </section>
      <section class="workflow-section"><div class="workflow-copy"><h2>From a quick look to a repeatable review.</h2><p>Use the browser to explore a project. Use the CLI to produce evidence that fits into a pull request or an agent's working context.</p><a class="text-link" href={`${props.base}docs/reports/`}>See report output <ArrowRight size={15}/></a></div><div class="workflow-code"><div class="code-title"><span>terminal</span><span>local analysis</span></div><pre><code>{`$ uvx srcly report . --out .srcly

report.md
findings.json
hotspots.json
metrics.schema.json

Analysis: 1,248 files · 6 tools · 42 unavailable`}</code></pre><p class="sample-caption">Illustrative terminal output</p></div></section>
      <section class="coverage-section"><h2>Useful signals, with their limits in view.</h2><div class="coverage-copy"><p>Srcly combines broad source metrics with language-aware analysis where available. The supported signals vary by language and tool setup; a metric that does not apply is N/A, never zero.</p><p>Data-flow analysis covers TypeScript, JavaScript, and Python. It runs with Node.js 18 or newer. Without Node, the rest of Srcly still works and data flow shows the reason it was not analyzed.</p><a class="text-link" href={`${props.base}docs/metrics/`}>How to read the metrics <ArrowRight size={15}/></a></div></section>
      <section class="docs-cta"><div><h2>Start with your codebase.</h2><p>One command opens the local explorer. The guides cover reports, findings, metrics, and configuration.</p></div><a class="button button-primary" href={`${props.base}docs/get-started/`}>Read the guide <ArrowRight size={16}/></a></section>
    </main>
    <Footer base={props.base}/>
  </div>;
}

function TreemapDemo(props: { metric: () => Metric; setMetric: (v: Metric) => void; selected: () => DemoFile; setSelected: (f: DemoFile) => void }) {
  const shown = () => props.selected();
  return <section class="demo" aria-label="Interactive illustrative treemap">
    <div class="demo-top"><div><span class="demo-title">srcly / example-project</span><span class="demo-sample">Sample data</span></div><span class="demo-status"><span/>Illustration</span></div>
    <div class="demo-toolbar"><div class="demo-crumb"><span>src</span><span>/</span><strong>analyzer</strong></div><div class="metric-control" role="group" aria-label="Color tiles by metric"><span>Color</span><button data-metric="complexity" type="button" classList={{ chosen: props.metric() === 'complexity' }} aria-pressed={props.metric() === 'complexity'} onClick={() => props.setMetric('complexity')}>Complexity</button><button data-metric="comment-noise" type="button" classList={{ chosen: props.metric() === 'comment noise' }} aria-pressed={props.metric() === 'comment noise'} onClick={() => props.setMetric('comment noise')}>Comment noise</button></div></div>
    <div class="demo-body"><div class="tile-map" role="group" aria-label="Sample source files. Tile size represents lines of code.">
      <For each={files}>{(file, i) => <button data-file={file.name} type="button" class={`map-tile tile-${i()}`} style={{ 'background-color': props.metric() === 'complexity' ? `hsl(200 38% ${91 - file.complexity * 1.4}%)` : `hsl(36 45% ${93 - file.comments * 4}%)` }} classList={{ selected: shown().name === file.name }} aria-pressed={shown().name === file.name} aria-label={`${file.name}, ${file.loc} lines of code, complexity ${file.complexity}, comment flags ${file.comments}`} onClick={() => props.setSelected(file)}><span>{file.name}</span><small>{file.loc} LOC</small></button>}</For>
      <span class="tile-label">AREA · LOC</span>
    </div><aside class="demo-detail" aria-live="polite"><div class="detail-top"><span>Selected file</span><span class="selected-dot"/></div><strong data-selected-file>{shown().name}</strong><dl><div><dt>Lines of code</dt><dd>{shown().loc}</dd></div><div><dt>Complexity</dt><dd>{shown().complexity}</dd></div><div><dt>Comment flags</dt><dd>{shown().comments}</dd></div></dl><p>{shown().note}</p><span class="metric-swatch" classList={{ warm: props.metric() === 'comment noise' }}><i/>Color: {props.metric()}</span></aside></div>
    <div class="demo-legend"><span><i class="legend-low"/>lower</span><span><i class="legend-high"/>higher {props.metric()}</span><span class="demo-footnote"><CircleHelp size={13}/> Example values, not a live scan</span></div>
  </section>;
}

function Header(props: { base: string }) { return <header class="site-header"><a class="brand" href={props.base} aria-label="Srcly home"><Mark/><span>srcly</span></a><nav aria-label="Main navigation"><a href={`${props.base}#explore`}>Explore</a><a href={`${props.base}docs/get-started/`}>Docs</a><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <Code2 size={13}/></a></nav></header>; }
function Mark() { return <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M2 2h11v11H2zM15 2h11v6H15zM15 10h11v16H15zM2 15h11v11H2z" fill="currentColor"/><path d="M4.5 4.5h6v6h-6z" fill="#fff"/></svg>; }
function Footer(props: { base: string }) { return <footer class="site-footer"><a class="brand footer-brand" href={props.base}><Mark/><span>srcly</span></a><span>Read the shape of your code.</span><div><a href={`${props.base}docs/get-started/`}>Docs</a><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <Code2 size={12}/></a></div></footer>; }
function CopyCommand(props: { text: string }) {
  const [copied, setCopied] = createSignal(false); let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => { try { await navigator.clipboard.writeText(props.text); setCopied(true); clearTimeout(timer); timer = setTimeout(() => setCopied(false), 1300); } catch { /* Keep the command visible and selectable. */ } };
  return <button class="command-button" type="button" onClick={run} aria-label={`Copy command ${props.text}`}><code><span>$</span> {props.text}</code><span class="command-copy" aria-hidden="true">{copied() ? <Check size={15}/> : 'Copy'}</span><span class="sr-only" aria-live="polite">{copied() ? 'Command copied' : ''}</span></button>;
}
