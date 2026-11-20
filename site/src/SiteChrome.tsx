import { ExternalLink } from 'lucide-solid';

export function Header(props: { base: string; active?: 'tour' | 'docs' }) {
  return <header class="site-header">
    <a class="brand" href={props.base} aria-label="Srcly home"><Mark/><span>srcly</span></a>
    <nav aria-label="Main navigation">
      <a href={`${props.base}#views`} classList={{ active: props.active === 'tour' }}>Guide</a>
      <a href={`${props.base}#reference`}>Reference</a>
      <a href={`${props.base}docs/`} classList={{ active: props.active === 'docs' }}>Docs</a>
      <a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a>
    </nav>
  </header>;
}

export function Footer(props: { base: string }) {
  return <footer class="site-footer">
    <a class="brand footer-brand" href={props.base}><Mark/><span>srcly</span></a>
    <span>Read the shape of your code. Runs on your machine.</span>
    <div>
      <a href={`${props.base}docs/`}>Docs</a>
      <a href="https://pypi.org/project/srcly/" target="_blank" rel="noreferrer">PyPI <ExternalLink size={12}/></a>
      <a href="https://byroni.us/projects/srcly" target="_blank" rel="noreferrer">byroni.us <ExternalLink size={12}/></a>
      <a href="https://github.com/byronwall/srcly" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12}/></a>
    </div>
  </footer>;
}

/** A four-tile treemap in the attention ramp. */
function Mark() {
  return <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
    <rect class="m1" x="1" y="1" width="15" height="17"/>
    <rect class="m2" x="16" y="1" width="11" height="10"/>
    <rect class="m3" x="16" y="11" width="11" height="16"/>
    <rect class="m4" x="1" y="18" width="15" height="9"/>
  </svg>;
}
