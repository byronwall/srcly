import { ArrowRight, ArrowUpRight } from 'lucide-solid';
import { createSignal, onCleanup } from 'solid-js';
import { Footer, Header } from './SiteChrome';
import { ScreenshotViewer } from './ScreenshotViewer';

const views = [
  {
    image: 'treemap.jpg',
    title: 'See the shape of a repository',
    detail: 'The treemap sizes each region by code volume and colors it by the selected signal. Move from a folder to the files that need attention.',
    guide: 'explore',
    guideTitle: 'Explore a codebase',
  },
  {
    image: 'code-inspector.jpg',
    title: 'Inspect code with its context',
    detail: 'Open a file or symbol to read source alongside its measurements and findings. Follow the evidence into the code you maintain.',
    guide: 'findings',
    guideTitle: 'Read findings',
  },
  {
    image: 'data-flow.jpg',
    title: 'Trace values across functions',
    detail: 'Follow supported TypeScript, JavaScript, and Python values through calls. Each trace names where it stops or why analysis is unavailable.',
    guide: 'data-flow',
    guideTitle: 'Understand data flow',
  },
];

export function Landing(props: { base: string }) {
  return <ScreenshotViewer><div class="site-shell landing-shell">
    <Header base={props.base} active="tour"/>
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <section class="hero-frame" aria-labelledby="hero-title">
        <div class="hero-copy">
          <h1 id="hero-title">See where the code gets hard.</h1>
          <p class="hero-deck">Explore a real codebase through its structure, measurements, and findings. Start with the whole tree, then open the code behind a signal.</p>
          <div class="hero-actions">
            <CopyCommand text="uvx srcly"/>
            <a class="button button-primary" href={`${props.base}docs/get-started/`}>Use Srcly <ArrowRight size={16}/></a>
          </div>
          <p class="hero-note">Runs on your machine. No account or upload.</p>
        </div>
        <figure class="hero-product-shot">
          <a class="shot-link" href={`${props.base}screenshots/treemap.jpg`} aria-label="Open full size screenshot of Srcly's repository treemap">
            <img src={`${props.base}screenshots/treemap.jpg`} alt="Srcly repository treemap with file regions sized by lines of code and colored by complexity." fetchpriority="high"/>
          </a>
          <figcaption><span>Repository overview</span><span>Area shows code volume · color shows the selected metric</span></figcaption>
        </figure>
      </section>

      <section class="product-tour" id="product-tour" aria-labelledby="tour-title">
        <div class="section-heading">
          <div><h2 id="tour-title">A codebase, from overview to evidence.</h2><p>Three views connect the shape of the project to the source and analysis behind it.</p></div>
          <a class="text-link" href={`${props.base}docs/tour/`}>Product tour <ArrowRight size={15}/></a>
        </div>
        <div class="tour-gallery">
          {views.map((view) => <article class="tour-view">
            <figure class="tour-shot">
              <a class="shot-link" href={`${props.base}screenshots/${view.image}`} aria-label={`Open full size screenshot: ${view.title}`}>
                <img src={`${props.base}screenshots/${view.image}`} alt={`${view.title}. Srcly application screenshot.`} loading="lazy"/>
              </a>
              <figcaption>{view.title}</figcaption>
            </figure>
            <p>{view.detail}</p>
            <a class="text-link" href={`${props.base}docs/${view.guide}/`}>{view.guideTitle} <ArrowUpRight size={14}/></a>
          </article>)}
        </div>
      </section>

      <section class="use-paths" aria-labelledby="use-title">
        <div><h2 id="use-title">See the product. Then use it on your code.</h2><p>Browse how Srcly works, or install it and open a local project. The same guides explain metrics, reports, the command line, and configuration.</p></div>
        <div class="path-links">
          <a href={`${props.base}docs/tour/`}><span><strong>See the product</strong><small>Walk through the explorer and its signals.</small></span><ArrowRight size={17}/></a>
          <a href={`${props.base}docs/get-started/`}><span><strong>Use Srcly</strong><small>Install the CLI and analyze a repository.</small></span><ArrowRight size={17}/></a>
        </div>
      </section>

      <section class="trust-note" aria-label="Analysis limits">
        <h2>Measurements keep their limits in view.</h2>
        <p>Supported signals vary by language and tool setup. A metric that does not apply is shown as N/A, never zero. Data-flow results name their outcome and stop reason.</p>
        <a class="text-link" href={`${props.base}docs/metrics/`}>How to read the metrics <ArrowRight size={15}/></a>
      </section>
    </main>
    <Footer base={props.base}/>
  </div></ScreenshotViewer>;
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
  return <button class="command-button" type="button" onClick={run} aria-label={`Copy command ${props.text}`}>
    <code><span>$</span> {props.text}</code>
    <span class="command-copy" aria-hidden="true">{copied() ? 'Copied' : 'Copy'}</span>
    <span class="sr-only" aria-live="polite">{copied() ? 'Command copied' : ''}</span>
  </button>;
}
