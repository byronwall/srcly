import { Search } from 'lucide-solid';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import catalog from './data/catalog.json';
import { COMMANDS } from './commands';

const docs = import.meta.glob('./docs/pages/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

type Entry = { title: string; kind: string; href: string; text: string };

const slugify = (text: string) => text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const plain = (text: string) => text.replace(/<[^>]+>/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_#>|]/g, '').replace(/\s+/g, ' ').trim();

/** Everything a visitor might look for: guide sections, every docs heading, every metric, every command. */
function buildIndex(base: string): Entry[] {
  const entries: Entry[] = [
    ['Install and first run', 'start', 'uvx srcly uv python install port host'],
    ['How to read the treemap', 'read', 'area color hatching N/A folders rollup zoom'],
    ['The views', 'views', 'treemap explorer hot spots 2x2 code viewer graph imports symbols data flow compare'],
    ['Common workflows', 'workflows', 'refactor pull request ratchet size budget fix unused exports'],
    ['Command line', 'cli', 'headless report explain hotspots compare fix check scan'],
    ['For coding agents', 'agents', 'agent skill llms.txt report explain json stdout'],
    ['Reference', 'reference', 'metrics languages analyzers checkers configuration environment variables'],
    ['How I built it', 'built', 'architecture fastapi solidjs lizard tree-sitter node engine'],
  ].map(([title, id, text]) => ({ title, kind: 'Guide', href: `${base}#${id}`, text }));
  for (const [path, source] of Object.entries(docs)) {
    const slug = path.match(/([\w-]+)\.md$/)![1];
    const page = source.match(/^# (.+)$/m)?.[1] ?? slug;
    const href = `${base}docs/${slug === 'overview' ? '' : `${slug}/`}`;
    const parts = source.split(/^##+ (.+)$/m);
    entries.push({ title: page, kind: 'Docs', href, text: plain(parts[0]) });
    for (let i = 1; i < parts.length; i += 2) {
      entries.push({ title: plain(parts[i]), kind: page, href: `${href}#${slugify(plain(parts[i]))}`, text: plain(parts[i + 1] ?? '') });
    }
  }
  for (const metric of catalog.metrics) {
    entries.push({ title: metric.label, kind: 'Metric', href: `${base}#metric-${metric.id}`, text: `${metric.description.replace(/`/g, '')} (${metric.id})` });
  }
  for (const [command, text] of COMMANDS) entries.push({ title: command, kind: 'Command', href: `${base}#cli`, text });
  return entries;
}

function rank(entries: Entry[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.flatMap(entry => {
    const title = entry.title.toLowerCase();
    const text = entry.text.toLowerCase();
    if (!words.every(word => title.includes(word) || text.includes(word))) return [];
    const score = words.reduce((sum, word) => sum + (title.startsWith(word) ? 4 : title.includes(word) ? 2 : 0), 0) + (entry.kind === 'Docs' || entry.kind === 'Guide' ? 0.5 : 0);
    return [{ entry, score }];
  }).sort((a, b) => b.score - a.score).slice(0, 8).map(({ entry }) => entry);
}

function snippet(text: string, query: string) {
  const word = query.toLowerCase().split(/\s+/).find(Boolean) ?? '';
  const at = text.toLowerCase().indexOf(word);
  const start = Math.max(0, at - 40);
  const cut = (start ? '…' : '') + text.slice(start, start + 110) + (text.length > start + 110 ? '…' : '');
  const hit = cut.toLowerCase().indexOf(word);
  if (!word || hit < 0) return cut;
  return <>{cut.slice(0, hit)}<mark>{cut.slice(hit, hit + word.length)}</mark>{cut.slice(hit + word.length)}</>;
}

/** The header search: `/` focuses it, arrows move, Enter opens, Esc closes. Results float over the page. */
export function SiteSearch(props: { base: string }) {
  const index = buildIndex(props.base);
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  const [open, setOpen] = createSignal(false);
  const results = createMemo(() => rank(index, query()));
  let input!: HTMLInputElement;
  let box!: HTMLDivElement;

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !/INPUT|TEXTAREA/.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        input.focus();
      }
    };
    const onDown = (event: PointerEvent) => { if (!box.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    onCleanup(() => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); });
  });

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    input.blur();
    window.location.href = entry.href;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, results().length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); go(results()[active()]); }
    else if (event.key === 'Escape') { setOpen(false); input.blur(); }
  };

  return <div class="site-search" ref={box} onClick={() => input.focus()}>
    <Search size={14} aria-hidden="true"/>
    <input ref={input} type="search" placeholder="Search docs, metrics, commands" aria-label="Search the site" data-site-search
      role="combobox" aria-expanded={open() && !!query()} aria-controls="site-search-results" aria-autocomplete="list"
      value={query()} onInput={event => { setQuery(event.currentTarget.value); setActive(0); setOpen(true); }}
      onFocus={() => setOpen(true)} onKeyDown={onKeyDown}/>
    <kbd aria-hidden="true">/</kbd>
    <Show when={open() && query()}>
      <div class="site-results" id="site-search-results" role="listbox">
        <Show when={results().length} fallback={<p class="site-empty">Nothing matches “{query()}”. Try “churn”, “ratchet” or “N/A”.</p>}>
          <For each={results()}>{(entry, i) => <a href={entry.href} role="option" aria-selected={i() === active()} classList={{ active: i() === active() }}
            onPointerMove={() => setActive(i())} onClick={() => setOpen(false)}>
            <span class="site-result-head"><strong>{entry.title}</strong><small>{entry.kind}</small></span>
            <span class="site-result-text">{snippet(entry.text, entry.title.toLowerCase().includes(query().toLowerCase().trim()) ? '' : query())}</span>
          </a>}</For>
        </Show>
      </div>
    </Show>
  </div>;
}
