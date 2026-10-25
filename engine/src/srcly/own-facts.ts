// Which of a declaration's facts are its own, not a nested function's.
import type { LanguageHost } from "./host";
import { sameSpan, type Span } from "./selection";

/**
 * The declaration's own facts: those its own function owns, not a helper
 * or callback nested inside it. A nested function's parameters and
 * returns are that function's; they reach the declaration only through
 * the calls the slices already follow. The own function is the widest one
 * the declaration's span holds (the declaration itself, or the arrow its
 * `const` holds). A fact that is itself a function (a returned arrow) is
 * its own owner and stays. Without scopes from the host, nothing is cut.
 */
export function ownFacts<T extends { location: { span: Span } }>(host: Pick<LanguageHost, "scopeAt">, file: string, span: Span, facts: T[]): T[] {
  const encloses = (outer: Span, inner: Span) =>
    (outer.startLine < inner.startLine || (outer.startLine === inner.startLine && outer.startColumn <= inner.startColumn)) &&
    (outer.endLine > inner.endLine || (outer.endLine === inner.endLine && outer.endColumn >= inner.endColumn));
  const owners = facts.map((fact) => host.scopeAt(file, fact.location.span)?.span ?? null);
  let own: Span | null = null;
  for (const owner of owners) if (owner && encloses(span, owner) && (!own || encloses(owner, own))) own = owner;
  if (!own) return facts;
  return facts.filter((fact, index) => {
    const owner = owners[index];
    return !owner || sameSpan(owner, own!) || sameSpan(owner, fact.location.span);
  });
}
