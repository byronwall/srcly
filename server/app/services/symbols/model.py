"""
The symbol reference graph: declarations and the typed references between them.

Where the dependency graph (``services/deps``) records *module seams* (which
file imports what, refined to the top-level declaration that uses it), this
graph records *symbol seams*: every function, class, method, field, variable
and type, and each place one of them calls, instantiates, reads, writes,
extends or names another, inside a file as well as across files.

Ids are ``<file>#<qualified>``: ``src/store.ts#Store`` for a top-level
declaration (the same id the dependency graph gives it), ``src/store.ts#Store.bump``
for a member or a nested function. A file's module-level code is the node
``<file>`` of kind ``module``.

Every reference says how it was resolved, because a name-based extractor
cannot always be sure:

- ``exact``: through an import binding, a declaration in scope, ``this`` or a
  class-qualified member;
- ``typed``: through a type annotation or a ``new`` initializer on the receiver;
- ``name``: by member name alone, when exactly one member of the whole index
  has it. Shown, never trusted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple

SymbolKind = Literal["function", "class", "method", "field", "variable", "type", "enum", "module"]
RefKind = Literal["call", "instantiate", "read", "write", "type", "extends", "implements", "http"]
Resolution = Literal["exact", "typed", "name"]

REF_KINDS: tuple[RefKind, ...] = ("call", "instantiate", "read", "write", "type", "extends", "implements", "http")

HTTP_METHODS = frozenset({"get", "post", "put", "delete", "patch", "options", "head"})
# Classes whose instances register routes; a variable holding one is a router, with its prefix.
ROUTER_CLASSES = frozenset({"APIRouter", "FastAPI", "Flask", "Blueprint"})

# Members every JavaScript or Python value may have. A `receiver.member` whose receiver is unknown and
# whose member is one of these is a library call until proven otherwise, never resolved by name.
BUILTIN_MEMBERS = frozenset(
    """
    length size name id type value key kind text data items children parent index count constructor prototype
    push pop shift unshift slice splice concat join reverse sort map filter reduce reduceRight forEach find findIndex
    findLast findLastIndex some every includes indexOf lastIndexOf flat flatMap fill copyWithin entries keys values at
    toString toLocaleString valueOf hasOwnProperty isPrototypeOf propertyIsEnumerable toJSON
    charAt charCodeAt codePointAt startsWith endsWith padStart padEnd trim trimStart trimEnd toUpperCase toLowerCase
    split replace replaceAll match matchAll search substring substr localeCompare normalize repeat
    get set has add delete clear
    then catch finally resolve reject all race any allSettled
    apply call bind
    test exec source flags lastIndex
    getTime getFullYear getMonth getDate getDay getHours getMinutes getSeconds toISOString
    log warn error info debug trace assert table group groupEnd time timeEnd
    stringify parse freeze assign create defineProperty getOwnPropertyNames getPrototypeOf
    addEventListener removeEventListener dispatchEvent querySelector querySelectorAll getAttribute setAttribute
    removeAttribute appendChild removeChild insertBefore classList style dataset textContent innerHTML
    focus blur click close open write read next done return throw
    append extend insert remove update copy items keys values get setdefault pop popitem clear sort reverse count
    index join split strip lstrip rstrip lower upper title startswith endswith format encode decode replace find
    isdigit isalpha read write readline readlines close flush seek tell exists is_file is_dir mkdir resolve relative_to
    parent stem suffix with_suffix with_name as_posix glob rglob iterdir
    readFileSync writeFileSync existsSync readdirSync statSync mkdirSync readFile writeFile dirname basename extname relative
    """.split()
)


@dataclass
class Symbol:
    id: str
    name: str
    kind: SymbolKind
    file: str  # repo-relative, forward slashes
    line: int
    end_line: int
    container: Optional[str] = None
    exported: bool = False
    language: str = "ts"
    # A variable's static type, as far as its declaration says: the symbol id of
    # the class it is an instance of (``new Store()``) or is annotated with.
    typed_as: Optional[str] = None
    members: Dict[str, str] = field(default_factory=dict)  # member name → symbol id
    # Classes: the ids of the classes it extends (after resolution).
    bases: List[str] = field(default_factory=list)
    # A route handler: its methods (upper case), the path as decorated, and the router symbol it is registered on.
    http_methods: List[str] = field(default_factory=list)
    http_path: Optional[str] = None
    http_router: Optional[str] = None

    @property
    def qualified(self) -> str:
        return self.id.partition("#")[2] if "#" in self.id else ""


@dataclass
class Reference:
    source: str  # symbol id (or the file's module node)
    target: str  # symbol id
    kind: RefKind
    line: int
    resolution: Resolution = "exact"
    # An HTTP reference: the request as matched, `GET /api/items/{id}`.
    via: Optional[str] = None


@dataclass
class HttpRequest:
    """A client request seen in a symbol: `fetch("/api/x")`, `new URL("/api/x", …)`, `api.post("/x")`."""

    source: str
    line: int
    # Upper case, or None when the call does not say (a `new URL` whose fetch is elsewhere in the function).
    method: Optional[str]
    # Same-origin path with `${…}` segments as `*`; None for a method-only hint (`fetch(url, {method: "DELETE"})`).
    path: Optional[str]


@dataclass
class PendingMember:
    """``receiver.member`` seen while extracting, resolved once every file is indexed."""

    source: str
    file: str
    line: int
    kind: RefKind
    member: str
    # The receiver, when it resolved to a symbol: a variable (typed or not), a class, or a module.
    receiver: Optional[str]
    # Why the receiver is unknown: a parameter, a local, an expression ("props.s").
    receiver_note: str = ""


@dataclass
class FileSymbols:
    """What one file contributes before cross-file resolution."""

    file: str
    symbols: List[Symbol] = field(default_factory=list)
    references: List[Reference] = field(default_factory=list)
    pending: List[PendingMember] = field(default_factory=list)
    # Classes: class id → the base class expressions as written, resolved later.
    bases: Dict[str, List[str]] = field(default_factory=dict)
    # Variables whose declared type names a symbol id already (resolved in-file).
    unresolved_members: int = 0
    # Routers declared in this file: symbol id → its prefix; and `A.include_router(B, prefix=…)`: (A id, B id, prefix).
    routers: Dict[str, str] = field(default_factory=dict)
    includes: List[Tuple[str, str, str]] = field(default_factory=list)
    requests: List[HttpRequest] = field(default_factory=list)
