import { ExternalLink } from 'lucide-solid';

export function Header(props: { base: string; active?: 'tour' | 'docs' }) {
  return <header class="site-header">
    <a class="brand" href={props.base} aria-label="Srcly home"><Mark/><span>srcly</span></a>
    <nav aria-label="Main navigation">
      <a href={`${props.base}#product-tour`} classList={{ active: props.active === 'tour' }}>Tour</a>
      <a href={`${props.base}docs/`} classList={{ active: props.active === 'docs' }}>Docs</a>
      <a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a>
    </nav>
  </header>;
}

export function Footer(props: { base: string }) {
  return <footer class="site-footer">
    <a class="brand footer-brand" href={props.base}><Mark/><span>srcly</span></a>
    <span>Read the shape of your code.</span>
    <div><a href={`${props.base}docs/`}>Docs</a><a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a></div>
  </footer>;
}

function Mark() {
  return <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M2 2h11v11H2zM15 2h11v6H15zM15 10h11v16H15zM2 15h11v11H2z" fill="currentColor"/>
    <path d="M4.5 4.5h6v6h-6z" fill="#fff"/>
  </svg>;
}
