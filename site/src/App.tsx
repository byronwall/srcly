import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
import { marked } from 'marked';
import { ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Code2, ExternalLink, Search, X } from 'lucide-solid';
import { Landing } from './Landing';

const docs = import.meta.glob('./docs/pages/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const pages = [
  { slug: 'get-started', title: 'Get started', description: 'Install Srcly and analyze your first codebase.' },
  { slug: 'explore', title: 'Explore a codebase', description: 'Navigate the treemap, hotspots, explorer, and code view.' },
  { slug: 'metrics', title: 'Metrics', description: 'Understand metric values, scope, and coverage.' },
  { slug: 'findings', title: 'Findings', description: 'Read checker findings and understand what Srcly measured.' },
  { slug: 'data-flow', title: 'Data flow', description: 'Trace TypeScript and JavaScript values through the codebase.' },
  { slug: 'reports', title: 'Reports', description: 'Write compact, reviewable analysis artifacts.' },
  { slug: 'cli', title: 'Command line', description: 'Use Srcly commands in scripts and agent workflows.' },
  { slug: 'configuration', title: 'Configuration', description: 'Set project rules, ignores, and analysis options.' },
];

const groups = [
  { title: 'Start', slugs: ['get-started', 'explore'] },
  { title: 'Understand', slugs: ['metrics', 'findings', 'data-flow'] },
  { title: 'Automate', slugs: ['reports', 'cli'] },
  { title: 'Configure', slugs: ['configuration'] },
];
const base = import.meta.env.BASE_URL;

export default function App(props: { path?: string }) {
  const pathname = props.path ?? '/';
  const localPath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '');
  const slug = localPath.replace(/^docs\/?/, '').replace(/\/$/, '') || (localPath === 'docs' ? 'get-started' : '');
  const page = pages.find(item => item.slug === slug);
  if (localPath === '' || localPath === 'index.html') return <Landing base={base} />;
  if (page) return <DocsPage page={page} base={base} />;
  return <NotFound base={base} />;
}

function DocsPage(props: { page: (typeof pages)[number]; base: string }) {
  const docKey = `./docs/pages/${props.page.slug}.md`;
  const source = docs[docKey] ?? `# ${props.page.title}\n\nThis guide is being prepared. Start with [Get started](${props.base}docs/get-started/).`;
  const normalizedSource = source.replace(/\]\(\.\.\/([a-z0-9-]+)\/?(#[^)]+)?\)/gi, (_match, target: string, hash = '') => `](${props.base}docs/${target}/${hash})`);
  const parsed = marked.parse(normalizedSource) as string;
  const headings: { title: string; id: string; depth: number }[] = [];
  const body = parsed.replace(/<h([23])>(.*?)<\/h\1>/g, (_full, level: string, raw: string) => {
    const title = raw.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    const id = slugify(title);
    headings.push({ title, id, depth: Number(level) });
    return `<h${level} id="${id}">${raw}</h${level}>`;
  });
  const [query, setQuery] = createSignal('');
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [copied, setCopied] = createSignal('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(copyTimer));
  const searchResults = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [];
    return pages.flatMap(candidate => {
      const text = docs[`./docs/pages/${candidate.slug}.md`] ?? '';
      const at = text.toLowerCase().indexOf(q);
      return (candidate.title.toLowerCase().includes(q) || at >= 0)
        ? [{ ...candidate, excerpt: at >= 0 ? excerpt(text, at) : candidate.description }]
        : [];
    });
  });
  const idx = pages.findIndex(p => p.slug === props.page.slug);
  const previous = pages[idx - 1];
  const next = pages[idx + 1];
  const copyCode = async (button: HTMLButtonElement, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(button.dataset.codeId ?? '');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => setCopied(''), 1200);
    } catch { /* The code stays selectable when clipboard access is unavailable. */ }
  };
  let codeIndex = 0;
  const contentHtml = body.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (full: string) => {
    const id = `code-${codeIndex++}`;
    return `<div class="code-wrap" data-code-id="${id}">${full}<button class="code-copy" type="button" data-code-id="${id}" aria-label="Copy code"><span aria-hidden="true">⧉</span><span class="sr-only">Copy code</span></button></div>`;
  });
  return <div class="site-shell docs-shell">
    <Header base={props.base} active="docs" />
    <a class="skip-link" href="#article">Skip to guide</a>
    <div class="docs-topline"><span>Documentation</span><span aria-hidden="true">/</span><span>{props.page.title}</span></div>
    <div class="docs-layout">
      <aside class="docs-sidebar" aria-label="Documentation navigation">
        <div class="sidebar-label">Browse guides</div>
        <div class="search-box"><Search size={15} aria-hidden="true"/><input data-doc-search aria-label="Search documentation" type="search" placeholder="Search guides" value={query()} onInput={e => setQuery(e.currentTarget.value)} /><Show when={query()}><button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button></Show></div>
        <Show when={query()} fallback={<For each={groups}>{group => <section class="nav-group"><h2>{group.title}</h2><For each={group.slugs}>{s => { const p = pages.find(x => x.slug === s)!; return <a class="side-link" classList={{ current: p.slug === props.page.slug }} href={`${props.base}docs/${p.slug}/`} aria-current={p.slug === props.page.slug ? 'page' : undefined}>{p.title}</a>; }}</For></section>}</For>}>
          <div class="search-results" aria-live="polite">
            <Show when={searchResults().length} fallback={<p class="empty-search">No guides match “{query()}”. Try “metric” or “report”.</p>}>
              <For each={searchResults()}>{result => <a class="search-result" data-search-result={result.slug} href={`${props.base}docs/${result.slug}/`}><strong>{result.title}</strong><span>{result.excerpt}</span></a>}</For>
            </Show>
          </div>
        </Show>
        <div class="sidebar-bottom"><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer"><Code2 size={14}/> View source <ExternalLink size={12}/></a></div>
      </aside>
      <main id="article" class="docs-article">
        <button type="button" class="topics-toggle" data-topics-toggle aria-expanded={menuOpen()} onClick={() => setMenuOpen(!menuOpen())}><BookOpen size={16}/> Topics <ChevronDown size={15} classList={{ rotated: menuOpen() }}/></button>
        <Show when={menuOpen()}><div class="mobile-topics" data-mobile-topics><For each={pages}>{p => <a href={`${props.base}docs/${p.slug}/`} aria-current={p.slug === props.page.slug ? 'page' : undefined}>{p.title}</a>}</For></div></Show>
        <div class="article-head"><div><p class="breadcrumb"><a href={`${props.base}docs/get-started/`}>Docs</a><span>/</span>{props.page.title}</p><h1>{props.page.title}</h1><p class="article-summary">{props.page.description}</p></div><a class="edit-link" href={`https://github.com/byronwall/srcly/tree/main/site/src/docs/pages/${props.page.slug}.md`} target="_blank" rel="noreferrer">Edit this page <ExternalLink size={13}/></a></div>
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
  </div>;
}

function slugify(text: string) { return text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s]+/g, '-'); }
function excerpt(text: string, at: number) { return text.slice(Math.max(0, at - 48), at + 90).replace(/[#*`\[\]()>]/g, ' ').replace(/\s+/g, ' ').trim(); }

function Header(props: { base: string; active?: string }) {
  return <header class="site-header"><a class="brand" href={props.base} aria-label="Srcly home"><Mark/><span>srcly</span></a><nav aria-label="Main navigation"><a href={`${props.base}#explore`} classList={{ active: props.active === 'explore' }}>Explore</a><a href={`${props.base}docs/get-started/`} classList={{ active: props.active === 'docs' }}>Docs</a><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a></nav></header>;
}
function Mark() { return <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M2 2h11v11H2zM15 2h11v6H15zM15 10h11v16H15zM2 15h11v11H2z" fill="currentColor"/><path d="M4.5 4.5h6v6h-6z" fill="#fff"/></svg>; }
function Footer(props: { base: string }) { return <footer class="site-footer"><a class="brand footer-brand" href={props.base}><Mark/><span>srcly</span></a><span>Read the shape of your code.</span><div><a href={`${props.base}docs/get-started/`}>Docs</a><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a></div></footer>; }
function NotFound(props: { base: string }) { return <div class="site-shell"><Header base={props.base}/><main class="not-found"><h1>This page is not here.</h1><p>Choose a guide from the documentation.</p><a class="text-link" href={`${props.base}docs/get-started/`}>Open the docs <ArrowRight size={15}/></a></main><Footer base={props.base}/></div>; }
