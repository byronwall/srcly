# Configuration

Most users can start Srcly without a configuration file. This page covers the project settings and environment variables that change scan behavior or optional checks.

## Choose the scan root

Pass a directory to `srcly` or a headless command to select the root. Without a path, Srcly uses the enclosing Git repository, or the current directory when it is not inside one. Srcly follows Git ignore rules and skips common generated, hidden, dependency, and build directories.

```bash
uvx srcly /path/to/repository
uvx srcly report /path/to/repository --out .srcly
```

The interactive server binds to `127.0.0.1` by default and chooses an available port. `--host` and `--port` select another interface or port. Use the local default for local code browsing.

## Add TypeScript reachability entries

Srcly detects common TypeScript entry points from routes, package metadata, scripts, and configuration. If your application uses an entry pattern that Srcly does not detect, add globs to `srcly.toml` at the Git root. Patterns are relative to that file.

```toml
[reachability]
entries = ["app/scripts/**/*.ts"]
```

Reachability applies to the TypeScript and JavaScript import graph. Treat an unreachable-file finding as a prompt to check your runtime entry points, dynamic loading, and project structure.

## Add ast-grep rules

Put ast-grep YAML rule files in `.srcly/rules/`. Srcly discovers `.yml` and `.yaml` files there and reports their matches with its other findings. Install the ast-grep CLI in the project or on `PATH`, or select it with `SRCLY_AST_GREP`. If it is not available, Srcly reports the check as unavailable.

See the [rule-pack examples](https://github.com/byronwall/srcly/tree/main/docs/rule-packs) for rule syntax and examples.

## Environment variables

- `SRCLY_NODE` selects the Node.js executable used by data-flow analysis. The default is `node` on `PATH`; Node.js 18 or newer is required.
- `SRCLY_CACHE_DIR` changes the local cache directory. By default, the cache is in the operating system's user cache location.
- `SRCLY_FINDINGS_TIMEOUT` sets the timeout for checker jobs.
- `SRCLY_DATAFLOW_TIMEOUT` overrides data-flow request timeouts.
- `SRCLY_AST_GREP` selects the ast-grep executable and overrides project and `PATH` discovery.

For the full list of command options, run `uvx srcly --help` or see the [CLI reference](../cli/). Use [Reports](../reports/) to select an output directory without changing cache settings.
