/** Srcly's architecture, left to right: entry points, the scan, its cache, and what reads it. */
export function Architecture() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], tone = '') =>
    <g class={`arch-box ${tone}`}>
      <rect x={x} y={y} width={w} height={h} rx="3"/>
      <text x={x + 10} y={y + 19} class="arch-title">{title}</text>
      {lines.map((line, i) => <text x={x + 10} y={y + 37 + i * 15} class="arch-line">{line}</text>)}
    </g>;
  const arrow = (d: string) => <path class="arch-edge" d={d} marker-end="url(#arch-head)"/>;
  return <svg class="arch-svg" viewBox="0 0 640 380" role="img" aria-labelledby="arch-title arch-desc">
    <title id="arch-title">How Srcly fits together</title>
    <desc id="arch-desc">The uvx srcly command starts a FastAPI server. A scan runs Lizard and tree-sitter analyzers in worker processes, builds one tree with rolled-up metrics, and saves it in the user cache. Checkers run beside the scan. The SolidJS app and the headless commands read the same scan. A Node data-flow engine starts only when the data-flow view needs it.</desc>
    <defs>
      <marker id="arch-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 8 4 0 8z" class="arch-head"/>
      </marker>
    </defs>
    {box(10, 30, 140, 74, 'uvx srcly', ['opens the app', 'in your browser'])}
    {box(10, 150, 140, 92, 'srcly report …', ['explain, hotspots,', 'compare, fix,', 'check, scan'])}
    {box(200, 10, 230, 250, 'FastAPI server', [], 'frame')}
    {box(214, 44, 202, 92, 'Scan', ['walk files, skip ignored', 'Lizard + tree-sitter,', 'one worker per file'], 'hot')}
    {box(214, 150, 202, 46, 'Tree + rollups', ['folders › files › scopes'])}
    {box(214, 206, 202, 44, 'Checkers', ['tsc, eslint, ruff, own rules'])}
    {box(480, 30, 150, 74, 'SolidJS app', ['treemap, graph,', '2×2, compare'])}
    {box(480, 150, 150, 74, 'User cache', ['one scan per repo,', 'until a file changes'], 'cool')}
    {box(200, 300, 230, 64, 'Data-flow engine', ['TypeScript on Node 18+,', 'started on first use'], 'na')}
    {arrow('M150 67 H198')}
    {arrow('M150 196 H198')}
    {arrow('M315 136 V148')}
    {arrow('M430 67 H478')}
    {arrow('M416 173 H478')}
    {arrow('M315 262 V298')}
  </svg>;
}
