import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { marked } from 'marked';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Code2, ExternalLink, Search, X } from 'lucide-solid';
import { Landing } from './Landing';
import { Footer, Header } from './SiteChrome';
import { ScreenshotViewer } from './ScreenshotViewer';

const docs = import.meta.glob('./docs/pages/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const pages = [
  { slug: 'overview', title: 'Overview', description: 'Choose a path through Srcly, from a quick tour to your first local analysis.' },
  { slug: 'tour', title: 'Product tour', description: 'See how the explorer connects repository structure, code, and analysis.' },
  { slug: 'design', title: 'Design decisions', description: 'Learn what Srcly measures, how it presents evidence, and where its limits are.' },
  { slug: 'get-started', title: 'Get started', description: 'Install Srcly and analyze your first codebase.' },
  { slug: 'explore', title: 'Explore a codebase', description: 'Navigate the treemap, hotspots, explorer, and code view.' },
  { slug: 'metrics', title: 'Metrics', description: 'Understand metric values, scope, and coverage.' },
  { slug: 'findings', title: 'Findings', description: 'Read checker findings and understand what Srcly measured.' },
  { slug: 'data-flow', title: 'Data flow', description: 'Trace TypeScript, JavaScript, and Python values through the codebase.' },
  { slug: 'reports', title: 'Reports', description: 'Write compact, reviewable analysis artifacts.' },
  { slug: 'cli', title: 'Command line', description: 'Use Srcly commands in scripts and agent workflows.' },
  { slug: 'configuration', title: 'Configuration', description: 'Set project rules, ignores, and analysis options.' },
];

const groups = [
  { title: 'Discover', slugs: ['overview', 'tour', 'design'] },
  { title: 'Use Srcly', slugs: ['get-started', 'explore', 'metrics', 'findings', 'data-flow'] },
  { title: 'Automate & configure', slugs: ['reports', 'cli', 'configuration'] },
];
const base = import.meta.env.BASE_URL;

export default function App(props: { path?: string }) {
  const pathname = props.path ?? '/';
  const localPath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const normalizedPath = localPath.replace(/^\/+|\/+$/g, '');
  if (normalizedPath === '' || normalizedPath === 'index.html') return <Landing base={base}/>;
  if (normalizedPath === 'docs') return <DocsPage page={pages[0]} base={base}/>;
  if (normalizedPath === 'docs/overview') return <DocsPage page={pages[0]} base={base}/>;
  const slug = normalizedPath.startsWith('docs/') ? normalizedPath.slice(5) : '';
  const page = pages.find(item => item.slug === slug);
  if (page) return <DocsPage page={page} base={base}/>;
  return <NotFound base={base}/>;
}

function DocsPage(props: { page: (typeof pages)[number]; base: string }) {
  const docKey = `./docs/pages/${props.page.slug}.md`;
  const source = docs[docKey] ?? `# ${props.page.title}\n\nThis guide is being prepared. Start with [Get started](${props.base}docs/get-started/).`;
  const normalizedSource = source.replace(/\]\(\.\.\/([a-z0-9-]+)\/?(#[^)]+)?\)/gi, (_match, target: string, hash = '') => `](${props.base}docs/${target}/${hash})`);
  const parsed = marked.parse(normalizedSource.replace(/^# .+\n+/, '')) as string;
  const headings: { title: string; id: string; depth: number }[] = [];
  const body = parsed.replace(/<h([23])>(.*?)<\/h\1>/g, (_full, level: string, raw: string) => {
    const title = decodeEntities(raw.replace(/<[^>]+>/g, ''));
    const id = slugify(title);
    headings.push({ title, id, depth: Number(level) });
    return `<h${level} id="${id}">${raw}</h${level}>`;
  }).replace(/<a href="([^"]*\/screenshots\/[^\"]+)"[^>]*>/g, '<a class="shot-link" href="$1">');
  const [query, setQuery] = createSignal('');
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [copied, setCopied] = createSignal('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let lastCopiedButton: HTMLButtonElement | undefined;
  onCleanup(() => clearTimeout(copyTimer));

  const searchResults = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [];
    return pages.flatMap(candidate => {
      const text = (docs[`./docs/pages/${candidate.slug}.md`] ?? '').replace(/<[^>]*>/g, '');
      const at = text.toLowerCase().indexOf(q);
      if (at < 0 && !candidate.title.toLowerCase().includes(q)) return [];
      const heading = matchingHeading(text, at);
      return [{ ...candidate, match: at >= 0 ? text.slice(at, at + q.length) : candidate.title, excerpt: at >= 0 ? excerpt(text, at) : candidate.description, anchor: heading ? slugify(heading) : '' }];
    });
  });
  const idx = pages.findIndex(p => p.slug === props.page.slug);
  const previous = pages[idx - 1];
  const next = pages[idx + 1];
  const copyCode = async (button: HTMLButtonElement, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      clearTimeout(copyTimer);
      if (lastCopiedButton && lastCopiedButton !== button) {
        lastCopiedButton.classList.remove('is-copied');
        lastCopiedButton.textContent = 'Copy';
      }
      setCopied(button.dataset.codeId ?? '');
      button.classList.add('is-copied');
      button.textContent = 'Copied';
      lastCopiedButton = button;
      copyTimer = setTimeout(() => {
        setCopied('');
        button.classList.remove('is-copied');
        button.textContent = 'Copy';
        if (lastCopiedButton === button) lastCopiedButton = undefined;
      }, 1300);
    } catch { /* The code stays selectable when clipboard access is unavailable. */ }
  };
  let codeIndex = 0;
  const contentHtml = body.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (full: string) => {
    const id = `code-${codeIndex++}`;
    return `<div class="code-wrap" data-code-id="${id}">${full}<button class="code-copy" type="button" data-code-id="${id}" aria-label="Copy code">Copy</button></div>`;
  });
  return <ScreenshotViewer>
    <div class="site-shell docs-shell">
      <Header base={props.base} active="docs"/>
      <a class="skip-link" href="#article">Skip to guide</a>
      <div class="docs-layout">
        <aside class="docs-sidebar" aria-label="Documentation navigation">
          <div class="sidebar-label">Documentation</div>
          <SearchBox query={query} setQuery={setQuery} />
          <Show when={query()} fallback={<For each={groups}>{group => <section class="nav-group"><h2>{group.title}</h2><For each={group.slugs}>{s => { const p = pages.find(x => x.slug === s)!; return <a class="side-link" classList={{ current: p.slug === props.page.slug }} href={`${props.base}docs/${p.slug}/`} aria-current={p.slug === props.page.slug ? 'page' : undefined}>{p.title}</a>; }}</For></section>}</For>}>
            <SearchContent query={query} results={searchResults}/>
          </Show>
          <div class="sidebar-bottom"><a href="https://github.com/byronwall/srcly/tree/codex/product-guide/site/src/docs/pages" target="_blank" rel="noreferrer"><Code2 size={14}/> Edit guides <ExternalLink size={12}/></a></div>
        </aside>
        <main id="article" class="docs-article">
          <div class="mobile-doc-tools">
            <SearchBox query={query} setQuery={setQuery} />
            <Show when={query()}><SearchContent query={query} results={searchResults}/></Show>
            <button type="button" class="topics-toggle" data-topics-toggle aria-expanded={menuOpen()} onClick={() => setMenuOpen(!menuOpen())}><BookOpen size={16}/> Topics <ChevronDown size={15} classList={{ rotated: menuOpen() }}/></button>
            <Show when={menuOpen()}><div class="mobile-topics" data-mobile-topics><For each={groups}>{group => <section><h2>{group.title}</h2><For each={group.slugs}>{s => { const p = pages.find(x => x.slug === s)!; return <a href={`${props.base}docs/${p.slug}/`} aria-current={p.slug === props.page.slug ? 'page' : undefined}>{p.title}</a>; }}</For></section>}</For></div></Show>
          </div>
          <div class="article-head">
            <div><h1>{props.page.title}</h1><p class="article-summary">{props.page.description}</p></div>
            <a class="edit-link" href={`https://github.com/byronwall/srcly/blob/codex/product-guide/site/src/docs/pages/${props.page.slug}.md`} target="_blank" rel="noreferrer">Edit page <ExternalLink size={13}/></a>
          </div>
          <div class="article-grid">
            <article class="markdown" innerHTML={contentHtml} ref={el => {
              el.addEventListener('click', event => {
                const button = (event.target as Element).closest<HTMLButtonElement>('.code-copy');
                if (!button) return;
                const pre = button.closest('.code-wrap')?.querySelector('code');
                if (pre) void copyCode(button, pre.textContent ?? '');
              });
            }} />
            <aside class="toc" aria-label="On this page"><h2>On this page</h2><Show when={headings.length} fallback={<p>Sections will appear here.</p>}><For each={headings}>{heading => <a classList={{ indent: heading.depth === 3 }} href={`#${heading.id}`}>{heading.title}</a>}</For></Show></aside>
          </div>
          <nav class="page-nav" aria-label="Guide pages"><Show when={previous}><a href={`${props.base}docs/${previous!.slug}/`}><ChevronLeft size={15}/><span><small>Previous</small><strong>{previous!.title}</strong></span></a></Show><Show when={next}><a class="next-page" href={`${props.base}docs/${next!.slug}/`}><span><small>Next</small><strong>{next!.title}</strong></span><ChevronRight size={15}/></a></Show></nav>
        </main>
      </div>
      <Footer base={props.base}/>
      <Show when={copied()}><span class="sr-only" aria-live="polite">Code copied</span></Show>
    </div>
  </ScreenshotViewer>;
}

function SearchBox(props: { query: () => string; setQuery: (value: string) => void }) {
  return <div class="search-box"><Search size={15} aria-hidden="true"/><input data-doc-search aria-label="Search documentation" type="search" placeholder="Search docs" value={props.query()} onInput={e => props.setQuery(e.currentTarget.value)}/><button class="search-clear" type="button" aria-label="Clear search" disabled={!props.query()} onClick={() => props.setQuery('')}><X size={14}/></button></div>;
}

function SearchContent(props: { query: () => string; results: () => SearchResult[] }) {
  return <div class="search-results" aria-live="polite">
    <Show when={props.results().length} fallback={<p class="empty-search">No guides match “{props.query()}”. Try “metric” or “report”.</p>}>
      <For each={props.results()}>{result => <a class="search-result" data-search-result={result.slug} href={`${base}docs/${result.slug}/${result.anchor ? `#${result.anchor}` : ''}`}><strong>{result.title}</strong><span>{highlight(result.excerpt, result.match)}</span></a>}</For>
    </Show>
  </div>;
}

type SearchResult = { slug: string; title: string; excerpt: string; match: string; anchor: string };
function highlight(text: string, match: string) {
  const index = text.toLowerCase().indexOf(match.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + match.length)}</mark>{text.slice(index + match.length)}</>;
}
function matchingHeading(text: string, at: number) {
  if (at < 0) return '';
  const headings = [...text.matchAll(/^#{2,3}\s+(.+)$/gm)];
  const lineStart = text.lastIndexOf('\n', at) + 1;
  const headingOnLine = headings.find(heading => heading.index === lineStart);
  if (headingOnLine) return cleanHeading(headingOnLine[1]);
  return cleanHeading([...headings].reverse().find(heading => heading.index! < at)?.[1] ?? '');
}
function cleanHeading(text: string) { return decodeEntities(text.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~]/g, '').trim()); }
function slugify(text: string) { return text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s]+/g, '-'); }
function excerpt(text: string, at: number) {
  const start = Math.max(0, at - 52);
  const from = start ? text.lastIndexOf(' ', start) + 1 : 0;
  return text.slice(from, at + 105).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`\[\]()>]/g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeEntities(text: string) { return text.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'); }

function NotFound(props: { base: string }) {
  return <div class="site-shell"><Header base={props.base}/><main class="not-found"><h1>This page is not here.</h1><p>Choose a guide from the documentation.</p><a class="text-link" href={`${props.base}docs/`}>Open the docs <ChevronRight size={15}/></a></main><Footer base={props.base}/></div>;
}
