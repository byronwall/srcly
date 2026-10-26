# python-anchors

Defs and classes the engine's Python provider (`engine/python/srcly_pyfacts.py`) anchors by name, as the import graph and the treemap ask for them (`{file, name, line}`). Tested in `engine/test/srcly/python-anchors.test.ts`.

| File | What it shows |
| --- | --- |
| `app/deps.py` | Python 3.14's unparenthesized `except A, B:` (PEP 758), a generator, a decorated def, an async def, and a def inside a `for` loop |
| `app/models.py` | a pydantic model whose first method is not its constructor, a plain class with `__init__`, and a class nothing constructs |
| `app/service.py` | the constructor calls: `Order(...)` and `Ledger(...)` |
| `app/identity.py` | one helper, two calls (T13): `ident` returns its argument to each call alone, `pick` returns only its second |
| `app/schemas.py` | a model's data flow: fields set by `ItemCreate(title=…)` and a dataclass's positional `Point(a, 2)`, read as `item.title`, and parameters annotated with the model; `Other.title` shares a name and never joins |
| `app/orm.py` | Django fields declared as `title = models.CharField(...)`: set by `Article(title=…)` and `Article.objects.create(body=…)`, read as `article.title`; `Draft`'s own `__init__` takes its keywords, and `status = "draft"` and `Meta`'s `ordering` are no fields |
| `app/settings.py` | a pydantic `BaseSettings` field read is an environment origin; a plain model's same-named field is not |
| `app/ends.py` | where values begin and end: constants, an empty list and `os.sep` begin one; `CONFIG["a"]` and `CONFIG["b"]` share only their receiver; a dropped `shout(text)` result and the write `holder.text = text` end one |
| `app/depends.py` | FastAPI dependencies: `me`'s `session` (through the `SessionDep` alias and `get_session`'s yield) and `user` (a `Depends(get_user)` default) take what those functions produce; `get_token` is entered from `Depends(…)` (assumed, partial); `helper`, which nothing calls or hands on, stays a gap |
| `app/consumers.py` | a second file annotating a parameter with `ItemCreate`: annotated uses fold by file, so it keeps its own box |
| `app/library.py` | one use of every row in `engine/models/python.json`, by mypy's name or the import's, so each row is shown to resolve |
| `app/external.py` | values handed to code outside the program (`json.dumps`, `list.append`, an import that is not installed) are external code; a call the checker cannot resolve is not |
| `app/web.py` | a Flask app: `request.json` / `request.args` are origins, a handler's return and `jsonify(...)` terminals; `@click.command()` enters `hello` from outside, `@functools.cache` does not; a parameter named `request` is not Flask's |
| `app/stops.py` | where a trace stops, named: `is_enabled`'s result is only read by an `if`, and `migrate` has nothing to trace |
| `app/broken.py` | a syntax error no rewrite fixes: anchoring in it names the parse failure |

Nothing here runs; it is only read.
