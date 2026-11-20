import { ArrowRight, ExternalLink } from 'lucide-solid';
import { For, createSignal, onCleanup, type JSX } from 'solid-js';
import { marked } from 'marked';
import { Footer, Header } from './SiteChrome';
import { ScreenshotViewer } from './ScreenshotViewer';
import { Scope, Source } from './Scope';
import { SourceTreemap } from './treemap';
import { Architecture } from './Architecture';
import { Reference } from './Reference';
import meta from './data/meta.json';
import cli from './data/cli.json';
import catalog from './data/catalog.json';

const num = (value: number) => value.toLocaleString('en-US');
const sections = ['start', 'read', 'views', 'workflows', 'cli', 'reference', 'built'];

export function Landing(props: { base: string }) {
  const doc = (slug: string) => `${props.base}docs/${slug}/`;
  const shot = (name: string) => `${props.base}screenshots/${name}.jpg`;
  return <ScreenshotViewer><div class="site-shell landing-shell">
    <a class="skip-link" href="#main">Skip to content</a>
    <Header base={props.base} active="tour"/>
    <nav class="pathbar" aria-label="Sections">
      <a href="#top">srcly</a>
      <For each={sections}>{id => <><span aria-hidden="true">/</span><a href={`#${id}`}>{id}</a></>}</For>
    </nav>
    <main id="main">
      <section class="hero scope" id="top" aria-labelledby="hero-title">
        <header class="scope-strip">
          <span class="scope-name">srcly/</span>
          <span class="source-num">{num(meta.loc)} LOC · {num(meta.files)} files · {num(meta.functions)} functions</span>
        </header>
        <div class="hero-map">
          <SourceTreemap width={1400} height={640} depth={8} class="map-wide"/>
          <SourceTreemap width={390} height={460} depth={8} class="map-narrow"/>
          <div class="hero-label">
            <h1 id="hero-title">See where the code gets hard.</h1>
            <p class="hero-deck">Srcly maps a repository into folders, files, functions and nested scopes, then colors the map by the metric you pick. Start with the whole tree, then open the code behind a signal.</p>
            <div class="hero-actions">
              <CopyCommand text="uvx srcly"/>
              <a class="button" href="#start">Get started <ArrowRight size={15}/></a>
            </div>
            <p class="hero-note">Runs on your machine. No account and no upload.</p>
          </div>
        </div>
        <footer class="hero-legend">
          <p>This map is Srcly's own source at <a href={`https://github.com/byronwall/srcly/tree/${meta.sha}`} target="_blank" rel="noreferrer"><code>{meta.sha}</code></a>, drawn from its scan. Area is lines of code. Color is the most complex function in each file.</p>
          <Legend/>
        </footer>
      </section>

      <Scope id="start" title="Install and first run" source="server/app/run.py"
        lead={<>Srcly is a Python package that you run with <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a>. Nothing is installed globally. It needs Python 3.13 or newer, and uv gets that for you if it is missing.</>}>
        <ol class="steps">
          <li>
            <h3>Run it in a repository</h3>
            <pre><code>{'uvx srcly\nuvx srcly .\nuvx srcly ~/code/app'}</code></pre>
            <p>With no path, Srcly walks up to the enclosing Git root. Pass <code>.</code> to scan only the current folder, or give any path.</p>
          </li>
          <li>
            <h3>Use the browser tab it opens</h3>
            <p>Srcly starts a local server on <code>127.0.0.1</code> with a free port and opens your browser. <code>--port</code> and <code>--host</code> change that. Keep the terminal open. <code>Ctrl+C</code> stops it.</p>
            <p>The path bar at the top picks another folder. Recent folders stay in the menu.</p>
          </li>
          <li>
            <h3>Wait for one scan</h3>
            <p>The first scan shows live progress per file. Srcly saves the result in your user cache folder, never in the repository. When you open an unchanged repository again, it loads at once. Any file change starts a fresh scan.</p>
            <p>Srcly's own repository, {num(meta.files)} files, scans in about ten seconds on a laptop.</p>
          </li>
        </ol>
        <p class="aside">Optional: data flow needs Node.js 18 or newer on <code>PATH</code>. Lint and type checks use the project's own <code>tsc</code> and <code>eslint</code> when <code>node_modules</code> has them, and the bundled <code>ruff</code> for Python. <a href={doc('get-started')}>Full setup guide</a></p>
      </Scope>

      <Scope id="read" title="How to read the treemap" source="client/src/viz/treemap"
        lead="Every rectangle is a piece of code, and every piece sits inside its parent. A folder holds files, a file holds functions, and a function holds its nested scopes.">
        <div class="read-grid">
          <figure class="read-map">
            <SourceTreemap width={640} height={420} depth={8} root="client/src" class="map-detail"/>
            <figcaption><code>client/src</code> from the same scan. Each tile is a file; its color is its most complex function.</figcaption>
          </figure>
          <dl class="defs">
            <dt>Area</dt>
            <dd>Lines of code: nonblank lines that are not only a comment. Lines inside a function that are not in a nested scope become a <code>(body)</code> tile, so a line is never counted twice.</dd>
            <dt>Color</dt>
            <dd>The metric you pick in <b>Color</b>. Every metric uses one ramp, from blue (fine) through amber to red (look here). Each metric sets its own stops. For complexity they are 0, 10 and 50.</dd>
            <dt>Hatching</dt>
            <dd>N/A. The metric does not apply to that file, or its tool did not run. Srcly never shows N/A as 0, and the tooltip gives the reason.</dd>
            <dt>Folders</dt>
            <dd>Each metric has one rollup rule. LOC is a sum. Complexity is the maximum and names the function that sets it. A sum such as LOC colors a folder by its average per file.</dd>
            <dt>Moving</dt>
            <dd>Click a folder to zoom in, and use the breadcrumb or the browser's Back button to go up. Click a file or function to read its source. The <b>All files</b> menu filters by file type, and the explorer can hide or isolate a path.</dd>
          </dl>
        </div>
      </Scope>

      <Scope id="views" title="The views" source="client/src/viz"
        lead="One scan feeds every view. They share the metric model, the location in the URL, and the browser's Back button.">
        <div class="views">
          <View shot={shot('treemap')} title="Treemap and explorer" source="client/src/components/Explorer.tsx" guide={doc('explore')}
            alt="Srcly's treemap of its own repository, colored by maximum complexity, beside the explorer tree.">
            <p>The explorer on the left is the same tree as the map, with sortable columns for LOC, complexity and the other metrics. A folder row shows its file count, and the header names the most complex function below it.</p>
          </View>
          <View shot={shot('hotspots')} title="Hot Spots" source="client/src/components/HotSpotList.tsx" guide={doc('explore')}
            alt="The Hot Spots list ranking Srcly's files by complexity beside the treemap.">
            <p>Ranks files and scopes worst first by one or more metrics you pick. N/A rows sit in their own group, because they can't be ranked. Click a row to open its source.</p>
          </View>
          <View shot={shot('quadrant')} title="2×2" source="client/src/viz/scatter" guide={doc('explore')}
            alt="The Activity 2×2 of Srcly's files, complexity against commits, with the Hot mess quadrant selected.">
            <p>Plots two metrics against each other and names the four quadrants. Drag a cut-off line to move items between quadrants. The {catalog.presets.length} presets:</p>
            <ul class="presets">
              <For each={catalog.presets}>{preset => <li><b>{preset.label}</b> {preset.x} × {preset.y}: {preset.quadrants.map(q => q.name).join(', ')}</li>}</For>
            </ul>
          </View>
          <View shot={shot('code-inspector')} title="Code viewer" source="client/src/components/CodeModal" guide={doc('findings')}
            alt="The code viewer showing buildViewModel, the most complex function in Srcly, with its metrics and marked lines.">
            <p>Opens the source with syntax highlighting, the file's metrics, and each finding with its rule and the tool that reported it. Click a metric to mark its lines in the code, such as each branch that adds to complexity. Markdown renders as a preview.</p>
          </View>
          <View shot={shot('graph')} title="Graph: imports" source="server/app/services/deps" guide={doc('explore')}
            alt="The import graph centered on Srcly's treemap folder, with importers on the left and imports on the right.">
            <p>Shows TypeScript and Python imports as folders, files and symbols. The focus sits in the middle, what imports it on the left, and what it imports on the right. <code>tsconfig</code> path aliases resolve, and barrel files pass through to the real module.</p>
          </View>
          <View shot={shot('symbols')} title="Graph: symbols" source="server/app/services/symbols" guide={doc('explore')}
            alt="Symbols mode centered on NotePage in the symbol-graph example, with its references and the inspector.">
            <p>Centers one function, class or component and shows what refers to it and what it refers to, from a reference index for TypeScript and Python. Press <kbd>/</kbd> to find a symbol. It can draw the path between two symbols and mark dead code and hubs.</p>
          </View>
          <View shot={shot('data-flow')} title="Graph: data flow" source="engine/src/srcly" guide={doc('data-flow')}
            alt="A data-flow trace from the NotePage route in the symbol-graph example, with where the trace stops in the inspector.">
            <p>Traces how a value moves through calls in TypeScript, JavaScript and Python: from a route, a function or one expression, forward, backward or both. Each trace names its outcome and the places it stops. It needs Node.js 18 or newer.</p>
          </View>
          <View shot={shot('compare')} title="Compare" source="client/src/compare" guide={doc('reports')}
            alt="Compare mode showing the metric changes of one Srcly pull request.">
            <p>Shows what a change did to the codebase: side-by-side treemaps, a table of metric changes, and before-and-after import graphs. Pick an open PR, a branch or a worktree, and step through a PR one commit at a time.</p>
          </View>
        </div>
        <p class="aside">The symbols and data-flow shots use <code>engine/examples/symbol-graph</code>, a small app in the repository. A trace over the whole Srcly repository takes minutes.</p>
      </Scope>

      <Scope id="workflows" title="Common workflows" source="server/app/services/reporting.py"
        lead="Each starts with a question. The answer is a place to read code, not a verdict on it.">
        <div class="workflows">
          <Workflow title="Find the refactor that pays off first">
            <li>Set <b>Color</b> to <i>Complexity (max)</i> and look for red inside big tiles.</li>
            <li>Open <b>Hot Spots</b> and click the top row. The code viewer opens on the function that sets the value.</li>
            <li>Switch to <b>2×2</b> with the <i>Activity</i> preset. Files in <i>Hot mess</i> are complex and change often.</li>
          </Workflow>
          <Workflow title="Review what a pull request did">
            <li>Click <b>Compare</b> and pick the PR, or run <code>uvx srcly compare main pr:42</code>.</li>
            <li>Read the table of changed files and their metric changes, then the before-and-after import graphs.</li>
            <li>A file measured on one side only counts as a coverage change, not as an improvement.</li>
          </Workflow>
          <Workflow title="Give a coding agent a map">
            <li>Run <code>uvx srcly report . --out .srcly</code>.</li>
            <li>Point the agent at <code>.srcly/report.md</code> and <code>agent-skill.md</code>.</li>
            <li>It drills in with <code>uvx srcly explain . --at &lt;path&gt;</code>, which reuses the cached scan and answers in about a second.</li>
          </Workflow>
          <Workflow title="Stop big files from getting bigger">
            <li><code>report</code> writes <code>size_budget.json</code>: each code file over 5,000 tokens (bytes ÷ 4).</li>
            <li>Add <code>uvx srcly check . --ratchet</code> to a pre-commit hook or CI.</li>
            <li>It exits 1 when a tracked file grows or a new file crosses the line. The baseline only goes down.</li>
          </Workflow>
          <Workflow title="Clean up exports nobody uses">
            <li>Run <code>uvx srcly fix .</code> to print a diff of the safe fixes.</li>
            <li>Add <code>--write</code> to apply them.</li>
            <li>Deleting unreachable files needs <code>--rule unreachable-file</code>. Reachability follows imports from the entries Srcly finds, plus any you add in <code>srcly.toml</code>.</li>
          </Workflow>
        </div>
      </Scope>

      <Scope id="cli" title="Command line" source="server/app/run.py"
        lead="Headless commands run the same scan and share the app's cache. Machine-readable output is the only thing on stdout; progress goes to stderr.">
        <table class="table commands">
          <thead><tr><th>Command</th><th>What it does</th></tr></thead>
          <tbody>
            <For each={commands}>{([cmd, text]) => <tr><td><code>{cmd}</code></td><td>{text}</td></tr>}</For>
          </tbody>
        </table>
        <div class="outputs">
          <figure class="output">
            <figcaption><code>uvx srcly hotspots . --metric complexity --cohort function --limit 6</code></figcaption>
            <pre><code>{cli.hotspots}</code></pre>
          </figure>
          <figure class="output">
            <figcaption><code>uvx srcly explain . --at client/src/viz/treemap</code></figcaption>
            <div class="rendered" innerHTML={marked.parse(cli.explain.replace(/^# .+\n+/, '')) as string}/>
          </figure>
        </div>
        <p class="aside">Both outputs are real, from Srcly scanning itself at <code>{meta.sha}</code>. <a href={doc('cli')}>Every command and flag</a> · <a href={doc('reports')}>What each report file holds</a></p>
      </Scope>

      <Scope id="reference" title="Reference" source="server/app/services/metric_catalog.py"
        lead="These tables come from Srcly's metric catalog, the same list the app's Color menu reads.">
        <Reference doc={doc}/>
      </Scope>

      <Scope id="built" title="How I built it" class="built">
        <div class="built-grid">
          <div class="prose">
            <p>I started Srcly in 2025 because I wanted to look at a codebase as a whole: where the code is, how complex it is, how often it changes, and how the pieces connect. A file list can't show that. A map can.</p>
            <p>It is a FastAPI server and a SolidJS client. The scan runs Lizard for broad language coverage, and tree-sitter analyzers where I want more than a function count. Everything lands in one tree of folders, files, functions and scopes, and the metrics roll up that tree so any level can be sorted, colored and ranked. The data-flow engine is TypeScript, so it runs as a Node process that starts only when you open that view.</p>
            <p>A few things I learned on the way:</p>
            <ul>
              <li>A measured 0 and "not measured" are different answers. If a missing value shows as 0, code where nothing ran looks clean. So N/A is its own state everywhere: hatched on the map, named in reports, and counted as lost coverage in compare.</li>
              <li>Show the lines behind a number. The overlay that marks them exposed a nesting bug that had inflated hotspot scores for long <code>else if</code> chains.</li>
              <li>The dependency graph took six rounds of before-and-after screenshots to read well. I tried ELK for layout and dropped it, because I couldn't steer its packing and edge bundling. Srcly now uses its own grid and router, and boxes never move after layout.</li>
            </ul>
            <p>The longer story is on <a href="https://byroni.us/projects/srcly" target="_blank" rel="noreferrer">the Srcly project page <ExternalLink size={12}/></a>, with posts on <a href="https://byroni.us/blog/making-srclys-dependency-graph-readable" target="_blank" rel="noreferrer">the dependency graph</a>, <a href="https://byroni.us/blog/showing-the-lines-behind-srclys-metrics" target="_blank" rel="noreferrer">the metric overlay</a> and <a href="https://byroni.us/blog/srcly-compare-what-a-pr-did-to-the-codebase" target="_blank" rel="noreferrer">compare</a>.</p>
          </div>
          <figure class="arch">
            <Architecture/>
            <figcaption>One scan, cached per repository, feeds the browser app and the headless commands. The Node engine starts only for data flow.</figcaption>
          </figure>
        </div>
      </Scope>
    </main>
    <Footer base={props.base}/>
  </div></ScreenshotViewer>;
}

const commands: [string, string][] = [
  ['srcly [path]', 'Scan and open the app. --host and --port pick the bind address.'],
  ['srcly report', 'Write report.md and JSON artifacts: findings, folders, hotspots, a tree summary, the metric schema and an agent guide. --quadrant adds a 2×2.'],
  ['srcly explain --at', 'Drill into the repo, a folder, a file, or file::symbol. Any printed "start at" value works.'],
  ['srcly hotspots', 'Rank files or functions by one metric. --format json for scripts.'],
  ['srcly compare [base] [head]', 'Metric and dependency changes between two refs. Defaults to the merge base against the working tree; pr:<n> names a PR.'],
  ['srcly fix', 'Print a diff of safe fixes for srcly\'s own findings; --write applies them.'],
  ['srcly check --ratchet', 'Exit 1 when a file over the size budget grows.'],
  ['srcly scan', 'Write the raw analysis tree as JSON.'],
];

function View(props: { shot: string; title: string; alt: string; source: string; guide: string; children: JSX.Element }) {
  return <article class="view">
    <a class="shot-link" href={props.shot} aria-label={`Open full size: ${props.title}`}>
      <img src={props.shot} alt={props.alt} width="1440" height="900" loading="lazy"/>
    </a>
    <div class="view-text">
      <h3>{props.title}</h3>
      {props.children}
      <div class="view-foot"><Source path={props.source}/><a href={props.guide}>Guide <ArrowRight size={13}/></a></div>
    </div>
  </article>;
}

function Workflow(props: { title: string; children: JSX.Element }) {
  return <article class="workflow"><h3>{props.title}</h3><ol>{props.children}</ol></article>;
}

function Legend() {
  return <div class="legend" aria-label="Color legend">
    <span class="legend-ramp" aria-hidden="true"/>
    <span class="legend-stops"><span>CCN 0</span><span>10</span><span>50+</span></span>
    <span class="legend-na"><i class="swatch na" aria-hidden="true"/> N/A: not measured</span>
  </div>;
}

function CopyCommand(props: { text: string }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [copied, setCopied] = createSignal(false);
  const run = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 1300);
    } catch { /* Keep the command visible and selectable. */ }
  };
  onCleanup(() => clearTimeout(timer));
  return <button class="command-button" classList={{ copied: copied() }} type="button" onClick={run} aria-label={`Copy command ${props.text}`}>
    <code><span aria-hidden="true">$</span> {props.text}</code>
    <span class="command-copy" aria-hidden="true">Copy</span>
    <span class="sr-only" aria-live="polite">{copied() ? 'Command copied' : ''}</span>
  </button>;
}
