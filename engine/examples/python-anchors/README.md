# python-anchors

Defs and classes the engine's Python provider (`engine/python/srcly_pyfacts.py`) anchors by name, as the import graph and the treemap ask for them (`{file, name, line}`). Tested in `engine/test/srcly/python-anchors.test.ts`.

| File | What it shows |
| --- | --- |
| `app/deps.py` | Python 3.14's unparenthesized `except A, B:` (PEP 758), a generator, a decorated def, an async def, and a def inside a `for` loop |
| `app/models.py` | a pydantic model whose first method is not its constructor, a plain class with `__init__`, and a class nothing constructs |
| `app/service.py` | the constructor calls: `Order(...)` and `Ledger(...)` |
| `app/identity.py` | one helper, two calls (T13): `ident` returns its argument to each call alone, `pick` returns only its second |
| `app/broken.py` | a syntax error no rewrite fixes: anchoring in it names the parse failure |

Nothing here runs; it is only read.
