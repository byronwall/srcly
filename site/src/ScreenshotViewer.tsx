import { Show, createSignal, onCleanup, type JSX } from 'solid-js';
import { Minus, Plus, RotateCcw, X } from 'lucide-solid';

export function ScreenshotViewer(props: { children: JSX.Element }) {
  const [source, setSource] = createSignal('');
  const [alt, setAlt] = createSignal('');
  const [scale, setScale] = createSignal(1);
  let dialog!: HTMLDialogElement;
  let trigger: HTMLElement | undefined;

  const open = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('.shot-link');
    if (!link) return;
    const image = link.querySelector('img');
    if (!image) return;
    event.preventDefault();
    trigger = link;
    setSource(link.href);
    setAlt(image.alt);
    setScale(1);
    dialog.showModal();
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };
  const onClose = () => {
    setSource('');
    trigger?.focus();
    trigger = undefined;
  };
  onCleanup(() => dialog?.removeEventListener('close', onClose));

  return <div class="screenshot-surface" onClick={open}>
    {props.children}
    <dialog class="screenshot-dialog" ref={el => { dialog = el; el.addEventListener('close', onClose); }} onClick={event => { if (event.target === dialog) close(); }} aria-label="Screenshot viewer">
      <div class="viewer-toolbar">
        <span>Screenshot</span>
        <div class="viewer-controls">
          <button type="button" aria-label="Zoom out" disabled={scale() <= 0.5} onClick={() => setScale(value => Math.max(0.5, value - 0.25))}><Minus size={16}/></button>
          <span>{Math.round(scale() * 100)}%</span>
          <button type="button" aria-label="Zoom in" disabled={scale() >= 2.5} onClick={() => setScale(value => Math.min(2.5, value + 0.25))}><Plus size={16}/></button>
          <button type="button" aria-label="Reset zoom" onClick={() => setScale(1)}><RotateCcw size={15}/></button>
          <button type="button" aria-label="Close screenshot" onClick={close}><X size={17}/></button>
        </div>
      </div>
      <div class="viewer-viewport" tabindex="0">
        <Show when={source()}>{src => <img src={src()} alt={alt()} style={{ width: `${scale() * 100}%` }}/>}</Show>
      </div>
      <p class="sr-only" aria-live="polite">{source() ? alt() : ''}</p>
    </dialog>
  </div>;
}
