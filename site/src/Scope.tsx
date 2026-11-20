import type { JSX } from 'solid-js';
import { nodeAt, rampColor } from './treemap';

const github = 'https://github.com/byronwall/srcly';

/** A repo path's real size and complexity from `data/tree.json`, linked to its source. */
export function Source(props: { path: string }) {
  const node = nodeAt(props.path);
  const folder = !!node?.k;
  const href = `${github}/${folder ? 'tree' : 'blob'}/main/${props.path}`;
  return <a class="source" href={href} target="_blank" rel="noreferrer" title="Lines of code and the most complex function in this part of Srcly's source">
    <i class="swatch" classList={{ na: node?.c === undefined }} style={{ '--fill': rampColor(node?.c) }} />
    <span class="source-path">{props.path}{folder ? '/' : ''}</span>
    <span class="source-num">{node ? `${node.l.toLocaleString('en-US')} LOC` : ''}{node?.c !== undefined ? ` · CCN ${node.c}` : ''}</span>
  </a>;
}

/**
 * A page section drawn as a treemap scope: a folder-style header strip with the
 * part of Srcly's source that implements it, then the content.
 */
export function Scope(props: { id: string; title: string; lead?: JSX.Element; source?: string; class?: string; children: JSX.Element }) {
  return <section class={`scope ${props.class ?? ''}`} id={props.id} aria-labelledby={`${props.id}-title`}>
    <header class="scope-strip">
      <a class="scope-name" href={`#${props.id}`}>{props.id}/</a>
      {props.source ? <Source path={props.source}/> : null}
    </header>
    <div class="scope-body">
      <div class="scope-head">
        <h2 id={`${props.id}-title`}>{props.title}</h2>
        {props.lead ? <p class="lead">{props.lead}</p> : null}
      </div>
      {props.children}
    </div>
  </section>;
}
