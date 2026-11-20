// Read-only research micro-check. This is not an application/engine test.
// Loads three pinned pure projection functions. Only type syntax/imports/exports
// are stripped; visual vocabulary/color dependencies are replaced with stubs.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || 'source');
const paths = ['client/src/viz/deps/flow/anchorAdapter.ts', 'client/src/viz/deps/flow/multiAnchorAdapter.ts', 'client/src/viz/deps/flow/reach.ts'];
const hashes = {};
const code = paths.map(path => {
  const raw = readFileSync(resolve(root, path), 'utf8');
  hashes[path] = createHash('sha256').update(raw).digest('hex');
  const withoutImports = raw.replace(/^import .*;\s*$/gm, '');
  return stripTypeScriptTypes(withoutImports).replace(/^export /gm, '');
}).join('\n');
const context = {
  MARK_OF_ANCHOR_KIND: new Proxy({}, { get: (_target, key) => key }),
  humanizeDetail: value => value,
  markColor: () => '#64748B',
  stopWord: value => value || 'unknown',
};
runInNewContext(code + '\nthis.project = anchorGraphToViewModel; this.merge = anchorsToViewModel; this.reach = reachFrom;', context);
const span = {startLine:1,startColumn:1,endLine:1,endColumn:2};
const node = (id, extra = {}) => ({ id, kind: 'value', elementKind: 'value', label: id, status: 'proven', side: 'down', file: 'synthetic.ts', absPath: '/synthetic.ts', line: 1, span, detail: null, parent: null, typeText: null, reason: null, note: null, ...extra });
const edge = (id, source, target, extra = {}) => ({ id, source, target, kind: 'carrier', status: 'proven', label: null, proof: [{kind:'function-call',detail:'Synthetic relation supplied to projection',status:extra.status || 'proven',locations:[{file:'synthetic.ts',line:1,column:1,span}]}], ...extra });
const graph = (nodes, edges) => ({ outcome: 'partial', generation: 1, programHash: 'synthetic', tsconfig:'synthetic', typescript:'not-run', reason:null, direction:'both', anchor: { file:'synthetic.ts',absPath:'/synthetic.ts',span,text:nodes.find(n => n.kind === 'anchor')?.label || 'seed',kind:'Identifier',elementId:nodes.find(n=>n.kind==='anchor')?.id || null,typeText:null }, nodes, edges, origins:[],terminals:[],counts:{up:0,down:0,scopes:0,origins:0,terminals:0,boundaries:0,frontiers:0},coverage:{elements:nodes.length,relations:edges.length,budget:{limit:1000,used:edges.length,exhausted:false}} });
const summarizeReach = (model, seed) => {
  const r = context.reach(model, seed, 'down');
  return [...new Set([...r.strong.nodes, ...r.light.nodes])].sort();
};
const results = [];

// P1: two independent pieces inside one folded function become a drawable path.
const foldInput = graph([
  node('home', {kind: 'scope'}), node('remote', {kind: 'scope'}),
  node('A', {kind: 'anchor', side: 'seed', parent: 'home'}),
  node('u', {parent: 'remote'}), node('v', {parent: 'remote'}), node('B', {kind: 'terminal'}),
  ...Array.from({length: 39}, (_, i) => node('filler' + i, {parent: 'remote'})),
], [edge('au', 'A', 'u'), edge('vb', 'v', 'B')]);
const foldModel = context.project(foldInput, {expanded: []});
const rawFoldReach = summarizeReach({edges: foldInput.edges.map(e => ({...e, faint: false}))}, 'A');
const projectedFoldReach = summarizeReach(foldModel.vm, 'A');
results.push({id: 'P1', name: 'folded disconnected members', inputNodes: foldInput.nodes.length, rawReach: rawFoldReach, projectedReach: projectedFoldReach, manufacturedReachToB: !rawFoldReach.includes('B') && projectedFoldReach.includes('B')});

// P2: endpoint deduplication retains the first proof/status variant.
const pairNodes = [node('A', {kind: 'anchor', side: 'seed'}), node('B')];
const variants = [edge('proven', 'A', 'B'), edge('partial', 'A', 'B', {status: 'partial'})];
results.push({id: 'P2', name: 'parallel evidence order', forwardOrder: context.project(graph(pairNodes, variants)).vm.edges.map(e => ({id:e.id,status:e.status})), reverseOrder: context.project(graph(pairNodes, [...variants].reverse())).vm.edges.map(e => ({id:e.id,status:e.status}))});

// P3: eliminating a same-name reference discards its non-proven status.
const referenceInput = graph([
  node('S', {kind: 'anchor', side:'seed'}), node('A', {label:'x'}),
  node('R', {label:'x'}), node('B'),
], [edge('sa','S','A'), edge('ar', 'A', 'R', {kind:'references', status:'partial'}), edge('rb','R','B')]);
const referenceModel = context.project(referenceInput);
results.push({id:'P3', name:'removed reference proof', rawProvenEligibleReach:summarizeReach({edges:referenceInput.edges.map(e=>({...e,faint:e.status!=='proven'}))},'A'), projectedReach:summarizeReach(referenceModel.vm,'A'), retainedEdges:referenceModel.vm.edges.map(e=>({id:e.id,source:e.source,target:e.target,status:e.status}))});

// P4: membership in two query results is not a composed query witness.
const left = graph([node('A', {kind:'anchor',side:'seed'}), node('X')], [edge('ax','A','X')]);
const right = graph([node('B', {kind:'anchor',side:'seed'}), node('X')], [edge('xb','X','B')]);
const merged = context.merge([left,right]);
results.push({id:'P4', name:'multi-query union', graphOneReach:summarizeReach(context.project(left).vm,'A'), mergedReach:summarizeReach(merged.model.vm,'A'), shared:[...merged.shared.keys()], nodeNote:merged.model.vm.nodes.find(n=>n.id==='X')?.note, implication:'The union has reachability that neither query individually certifies; invocation compatibility remains unevaluated.'});

const output = {runStatus:'executed-isolated-pure-projection-check', baseline:'ee8a771ce94fb59573492445d0f5fa2411ad83c8', node:process.version, sourceHashes:hashes, limitations:['Synthetic graph inputs; collector and engine not executed.', 'UI layout, browser behavior and real-repository frequency not measured.', 'Visual label/color imports stubbed; actual projection and reach function bodies executed.', 'These checks demonstrate projection properties, not end-to-end bug incidence. Input counts are placeholders, and no engine/schema validation was run.'], results};
writeFileSync(resolve('work/projection-check-results.json'), JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
