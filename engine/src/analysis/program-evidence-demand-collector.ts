import type * as TypeScript from "typescript";
import type { SourceSpan } from "../types";
import type { AnalysisCancellationToken } from "./cancellation";
import { transportCandidates } from "./program-evidence-transport-candidates";
import { ProgramEvidenceCollector } from "./program-evidence-collector";
import { programEvidenceCandidateIndex, type ProgramEvidenceCandidateIndex } from "./program-evidence-candidate-index";
import type { ProgramElementKind, ProgramEvidenceOptions } from "./program-evidence";
import type { SliceDirection } from "./scope-seam";
import type { CollectorCallInfo } from "./program-evidence-collector-support";
import type { RelationSink } from "./program-evidence-relation-loading";
import { asFunctionLike, bindingIdentifiers, firstBindingIdentifier, functionNameNode, isAssignmentOperator, relative, unwrap } from "./program-evidence-support";

/** One Program, with declaration types and body evidence loaded as queries need them. */
export class ProgramEvidenceDemandCollector extends ProgramEvidenceCollector {
  private readonly candidates: ProgramEvidenceCandidateIndex;
  private readonly roots = new Set<TypeScript.Node>();
  private readonly expanded = new Set<string>();
  private collecting = false;
  private collectionElapsedMs = 0;
  private astUnitsVisited = 0;
  private activeCancellation?: AnalysisCancellationToken;
  private transportLoaded = false;
  private readonly requestedRoots = new Set<TypeScript.Node>();
  private readonly connectedFieldRoots = new Set<TypeScript.Node>();
  private readonly variableSummaries = new WeakSet<TypeScript.VariableDeclaration>();
  private readonly collectedCalls = new WeakSet<TypeScript.CallExpression>();
  private readonly summarizedNodes = new WeakSet<TypeScript.Node>();
  private readonly connectedCalls = new Map<string, string | null>();
  private readonly connectedReferences = new Map<string, string>();

  constructor(ts: typeof TypeScript, program: TypeScript.Program, root: string, options: ProgramEvidenceOptions, sink: RelationSink) {
    super(ts, program, root, options, sink);
    this.candidates = programEvidenceCandidateIndex(ts, program, root, this.files);
    // TypeScript orders merged properties and printed unions by type creation order.
    // Prime parameter types in source order before demand work changes that order.
    // Fact creation, handler classification, and type formatting remain deferred.
    const prime = (node: TypeScript.Node) => {
      this.checkCancellation();
      const fn = asFunctionLike(this.ts, node);
      if (fn) for (const parameter of fn.parameters) {
        try { this.checker.getTypeAtLocation(parameter); } catch { /* Match safeType's unknown fallback. */ }
      }
      this.ts.forEachChild(node, prime);
    };
    for (const file of this.files) prime(file);
    for (const file of this.files) this.deferDeclarations(file);
  }

  get collected() { return { facts: this.facts, gaps: this.gaps }; }

  protected override checkCancellation(): void { super.checkCancellation(); this.activeCancellation?.throwIfCancelled(); }
  protected override noteAstUnit(): void { this.astUnitsVisited += 1; super.noteAstUnit(); }

  getDemandStats() {
    const sourceFilesVisited = new Set([...this.roots].map((node) => node.getSourceFile())).size;
    return {
      collectionElapsedMs: this.collectionElapsedMs, partitionsVisited: this.roots.size,
      sourceFilesVisited, astUnitsVisited: this.astUnitsVisited,
      collectorStats: { ...this.getCollectionStats(), sourceFilesVisited, astUnitsVisited: this.astUnitsVisited },
    };
  }

  protected override bodyRoots(): readonly TypeScript.Node[] { return [...this.roots].sort((a, b) => a.getSourceFile().fileName.localeCompare(b.getSourceFile().fileName) || a.pos - b.pos); }
  protected override bodyCollected(node: TypeScript.Node): boolean { return this.roots.has(this.partition(node)); }
  protected override connectFieldTransfers(): void {
    const roots = this.bodyRoots().filter((root) => !this.connectedFieldRoots.has(root));
    super.connectFieldTransfers(roots);
    for (const root of roots) this.connectedFieldRoots.add(root);
  }
  protected override requireReferences(node: TypeScript.Node): void {
    for (const reference of this.referenceCandidates(node, true)) {
      const root = this.partition(reference);
      if (!this.roots.has(root)) this.requestedRoots.add(root);
    }
  }

  protected override addFunction(node: TypeScript.FunctionLikeDeclaration, ownerId: string | null) {
    const info = super.addFunction(node, ownerId);
    this.returnsByFunction.defer(info.id, () => {
      this.returnsByFunction.set(info.id, []);
      const visit = (child: TypeScript.Node) => {
        if (child !== node && asFunctionLike(this.ts, child)) return;
        if (this.ts.isReturnStatement(child)) this.processReturn(child, info.id);
        if (this.ts.isYieldExpression(child) && child.expression) this.processReturn(child.expression, info.id);
        this.ts.forEachChild(child, visit);
      };
      if (this.ts.isArrowFunction(node) && !this.ts.isBlock(node.body)) this.processReturn(node.body, info.id);
      else visit(node);
    });
    return info;
  }

  protected override prepareComponentReceiver(node: TypeScript.PropertyAccessExpression): void {
    if (!this.elementIfPresent(node, "field-read")) this.processProperty(node, this.ownerId(node));
  }

  protected override processVariable(node: TypeScript.VariableDeclaration, ownerId: string | null): void {
    if (this.variableSummaries.has(node)) return;
    this.variableSummaries.add(node);
    super.processVariable(node, ownerId);
    const initializer = node.initializer ? unwrap(this.ts, node.initializer) : null;
    if (initializer && this.ts.isCallExpression(initializer)) this.processCall(initializer, ownerId);
  }

  protected override processCall(node: TypeScript.CallExpression, ownerId: string | null): void {
    if (this.collectedCalls.has(node)) return;
    this.collectedCalls.add(node);
    super.processCall(node, ownerId);
  }

  protected override elementFor(node: TypeScript.Node, kind: ProgramElementKind): string {
    const known = this.elementIfPresent(node, kind);
    if (known) return known;
    const root = this.partition(node);
    if (!this.roots.has(root) && this.filesByRelativeName.has(relative(this.root, node.getSourceFile().fileName))) {
      this.roots.add(root);
      this.collectNodes(root);
      this.requestedRoots.add(root);
    }
    return super.elementFor(node, kind);
  }

  protected override shouldConnectCall(call: CollectorCallInfo): boolean {
    const target = call.target?.id ?? null;
    if (this.connectedCalls.has(call.id) && this.connectedCalls.get(call.id) === target) return false;
    this.connectedCalls.set(call.id, target);
    return true;
  }

  protected override connectPendingReferences(): void {
    const pending = this.references.filter((reference) => {
      if (!this.bodyCollected(reference.node)) return false;
      const symbol = reference.symbolId ?? "";
      const target = this.stateBySymbol.get(symbol) ?? this.variablesBySymbol.get(symbol) ?? "";
      const bindings = this.assignments.get(symbol)?.bindings.length ?? 0;
      const key = `${target}:${bindings}`;
      if (this.connectedReferences.get(reference.id) === key) return false;
      this.connectedReferences.set(reference.id, key);
      return true;
    });
    super.connectPendingReferences(pending);
  }

  private partition(node: TypeScript.Node): TypeScript.Node {
    while (node.parent && !this.ts.isSourceFile(node.parent)) node = node.parent;
    return node;
  }

  ensureFile(file: string, span?: SourceSpan): void {
    const source = this.candidates.fileFor(file);
    if (!source) return;
    if (!span) { this.ensureRoots(source.statements); return; }
    const start = source.getPositionOfLineAndCharacter(span.startLine - 1, span.startColumn - 1);
    const end = source.getPositionOfLineAndCharacter(span.endLine - 1, span.endColumn - 1);
    this.ensureRoots(source.statements.filter((node) => node.getStart(source) <= start && node.end >= end));
  }

  ensureAll(): void { this.ensureRoots(this.files.flatMap((file) => [...file.statements])); }

  ensureFrontier(elementId: string, direction: SliceDirection, returnTo?: string, cancellation?: AnalysisCancellationToken): void {
    const previous = this.activeCancellation;
    this.activeCancellation = cancellation;
    try { this.prepareFrontier(elementId, direction, returnTo); }
    finally { this.activeCancellation = previous; }
  }

  private prepareFrontier(elementId: string, direction: SliceDirection, returnTo?: string): void {
    this.checkCancellation();
    if (!this.factsById.has(elementId)) this.ensureAll();
    const frontier = this.factsById.get(elementId);
    if (!this.transportLoaded && (frontier?.kind === "fetch-input" || frontier?.kind === "http-response" || frontier?.kind === "resource-input" && this.httpFetches.length > 0)) {
      this.transportLoaded = true;
      this.ensureRoots(transportCandidates(this.ts, this.files));
    }
    const key = `${elementId}:${direction}:${returnTo ?? ""}`;
    if (this.expanded.has(key)) return;
    this.expanded.add(key);
    const roots = new Set<TypeScript.Node>();
    const seen = new Set<string>();
    const add = (id: string | null, discover = true) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const fact = this.factsById.get(id);
      const node = this.factNodes.get(id);
      if (!fact || !node) return;
      roots.add(this.partition(node));
      const named = this.referenceNode(node);
      const declaration = fact.kind === "alias" || fact.kind === "parameter" || fact.kind.endsWith("-entry") || fact.kind === "component-definition";
      if (discover && named && fact.symbolId && (declaration || fact.kind === "field-read" && direction !== "forward") && this.isProjectSymbol(named)) {
        for (const reference of this.referenceCandidates(named, fact.kind.endsWith("-entry") || fact.kind === "component-definition")) {
          if (fact.kind !== "field-read" || this.mayWriteMember(reference)) roots.add(this.partition(reference));
        }
      }
      if (direction !== "forward" || fact.kind === "return" && !returnTo) add(fact.ownerId, direction === "backward" || fact.kind === "parameter" || fact.kind === "return");
      // Declaration links are already emitted when the call or JSX occurrence is collected.
      // Their bodies are needed only when a value enters that declaration.
    };
    add(elementId);
    if (returnTo) {
      const call = this.factNodes.get(returnTo);
      if (call) roots.add(this.partition(call));
    }
    if (process.env.SRCLY_DEMAND_TRACE === "1" && [...roots].some((root) => !this.roots.has(root))) process.stderr.write(`[frontier] ${JSON.stringify({ id: elementId, kind: this.factsById.get(elementId)?.kind, label: this.factsById.get(elementId)?.label, direction, returnTo, roots: [...roots].filter((root) => !this.roots.has(root)).map((node) => `${relative(this.root, node.getSourceFile().fileName)}:${node.getStart()}`) })}\n`);
    this.ensureRoots([...roots]);
  }

  /** Follow value aliases as candidate locations; existing proof rules still resolve each call. */
  private referenceCandidates(node: TypeScript.Node, aliases: boolean): readonly TypeScript.Node[] {
    if (!aliases) return this.candidates.referencesFor(node);
    const references = new Set<TypeScript.Node>();
    const pending = [node];
    const visited = new Set<TypeScript.Node>();
    while (pending.length) {
      const name = pending.pop()!;
      if (visited.has(name)) continue;
      visited.add(name);
      for (const reference of this.candidates.referencesFor(name)) {
        if (references.has(reference)) continue;
        references.add(reference);
        let value = reference;
        while (value.parent && (this.ts.isParenthesizedExpression(value.parent)
          || this.ts.isAsExpression(value.parent) || this.ts.isNonNullExpression(value.parent)
          || this.ts.isSatisfiesExpression(value.parent) || this.ts.isPropertyAccessExpression(value.parent))) value = value.parent;
        const parent = value.parent;
        if (parent && this.ts.isPropertyAssignment(parent) && parent.initializer === value) {
          if (this.ts.isIdentifier(parent.name) || this.ts.isStringLiteralLike(parent.name)) pending.push(parent.name);
          value = parent.parent;
        } else if (parent && this.ts.isShorthandPropertyAssignment(parent)) value = parent.parent;
        if (value.parent && this.ts.isVariableDeclaration(value.parent) && value.parent.initializer === value) {
          pending.push(...bindingIdentifiers(this.ts, value.parent.name));
        }
      }
    }
    return [...references];
  }

  private mayWriteMember(node: TypeScript.Node): boolean {
    const access = node.parent;
    if (!this.ts.isPropertyAccessExpression(access) || access.name !== node) return true;
    const parent = access.parent;
    return this.ts.isBinaryExpression(parent) && parent.left === access && isAssignmentOperator(this.ts, parent.operatorToken.kind)
      || this.ts.isPropertyAccessExpression(parent) && parent.expression === access && this.ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
  }

  private isProjectSymbol(node: TypeScript.Node): boolean {
    let symbol = this.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & this.ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
    return !!symbol?.declarations?.some((declaration) => this.filesByRelativeName.has(relative(this.root, declaration.getSourceFile().fileName)));
  }

  private referenceNode(node: TypeScript.Node): TypeScript.Node | null {
    const fn = asFunctionLike(this.ts, node);
    if (fn) return functionNameNode(this.ts, fn);
    if (this.ts.isVariableDeclaration(node) || this.ts.isParameter(node)) return firstBindingIdentifier(this.ts, node.name);
    if (this.ts.isCallExpression(node) || this.ts.isNewExpression(node)) return this.referenceNode(node.expression);
    if (this.ts.isPropertyAccessExpression(node)) return node.name;
    return this.ts.isIdentifier(node) ? node : null;
  }

  private ensureRoots(requested: readonly TypeScript.Node[]): void {
    if (this.collecting) throw new Error("Reentrant evidence collection");
    const pending = new Set(requested.filter((node) => this.filesByRelativeName.has(relative(this.root, node.getSourceFile().fileName)) && !this.roots.has(node)));
    if (!pending.size) return;
    this.collecting = true;
    const start = performance.now();
    try {
      // Calls and variable reads need the target body's returns and state before joining.
      while (pending.size) {
        const batch = [...pending].sort((a, b) => a.getSourceFile().fileName.localeCompare(b.getSourceFile().fileName) || a.pos - b.pos);
        pending.clear();
        for (const file of batch) {
          if (this.roots.has(file)) continue;
          this.checkCancellation();
          this.roots.add(file);
          this.measurePhase("nodes", 1, () => this.collectNodes(file));
        }
        const demand = (node: TypeScript.Node | undefined) => {
          if (!node) return;
          const root = this.partition(node);
          if (this.filesByRelativeName.has(relative(this.root, node.getSourceFile().fileName)) && !this.roots.has(root)) pending.add(root);
        };
        const summarize = (node: TypeScript.Node) => {
          if (this.summarizedNodes.has(node)) return;
          this.summarizedNodes.add(node);
          let symbol = this.checker.getSymbolAtLocation(node);
          if (symbol && symbol.flags & this.ts.SymbolFlags.Alias) symbol = this.checker.getAliasedSymbol(symbol);
          let declaration = symbol?.valueDeclaration;
          while (declaration && this.ts.isBindingElement(declaration)) declaration = declaration.parent.parent;
          if (declaration && this.ts.isVariableDeclaration(declaration) && declaration.initializer && this.isProjectSymbol(node) && !this.variableSummaries.has(declaration)) {
            this.processVariable(declaration, this.ownerId(declaration));
          }
        };
        for (const call of this.calls) summarize(call.node.expression);
        for (const reference of this.references) summarize(reference.node);
        for (const node of this.requestedRoots) demand(node);
        this.requestedRoots.clear();
        if (!pending.size) {
          this.measurePhase("connectCalls", this.calls.length, () => this.connectCalls());
          for (const node of this.requestedRoots) pending.add(this.partition(node));
          this.requestedRoots.clear();
        }
      }
      this.measurePhase("connectPendingReferences", this.references.length, () => this.connectPendingReferences());
      this.measurePhase("connectHttpBridges", this.calls.length, () => this.connectProgramEvidenceTransport(this.bodyRoots()));
      if (process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE === "1") process.stderr.write(`[demand] ${JSON.stringify({ requested: requested.map((node) => `${relative(this.root, node.getSourceFile().fileName)}:${node.getStart()}`), partitions: this.roots.size, facts: this.facts.length, ms: performance.now() - start })}\n`);
    } finally {
      this.collectionElapsedMs += performance.now() - start;
      this.collecting = false;
    }
  }
}
