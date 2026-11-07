# Configuration

Most users can start Srcly without a configuration file. Use this page when you need to choose a scan root, add TypeScript entry points, enable optional rules, or understand why a check is unavailable.

## Choose the scan root

Pass a directory to the interactive command or a headless command:

```bash
uvx srcly /path/to/repository
uvx srcly report /path/to/repository --out .srcly
```

Without a path, Srcly uses the enclosing Git repository or the current directory when no repository contains it. In a Git repository, discovery includes tracked files and nonignored untracked files. Srcly follows Git ignore rules and skips common generated, hidden, dependency, and build paths. Start at a subdirectory when you want a narrower review.

The interactive server binds to `127.0.0.1` by default and chooses an available port. Use `--host` or `--port` when you need to change those settings. The local app reads repository files through this server; keep the default local interface unless you have a specific reason to bind elsewhere.

## Configure TypeScript reachability entries

Srcly detects common TypeScript entry points from routes, package metadata, scripts, and configuration. If your application uses another entry pattern, add globs to `srcly.toml` at the Git root. Patterns are relative to that file:

```toml
[reachability]
entries = ["app/scripts/**/*.ts"]
```

Reachability follows the TypeScript and JavaScript import graph from entries. An unreachable-file signal is a prompt to inspect runtime entry points, dynamic loading, and project structure. It is not proof that a file is unused. After changing entries, refresh the report so the new analysis is used:

```bash
uvx srcly report . --refresh --out .srcly
```

## Add ast-grep rules

Put ast-grep YAML rules under `.srcly/rules/` in the project. Srcly discovers `.yml` and `.yaml` files there. Install ast-grep in the project or on `PATH`, or select it with `SRCLY_AST_GREP`. If the binary is unavailable, Srcly reports the check as unavailable rather than reporting zero matches.

See the [rule-pack examples](https://github.com/byronwall/srcly/tree/main/docs/rule-packs) for syntax and sample rules. Rerun the scan after adding rules or changing the checker environment.

## Set environment variables

| Variable | Purpose |
| --- | --- |
| `SRCLY_NODE` | Select the Node executable for data-flow analysis. Defaults to `node` on `PATH`; Node.js 18 or newer is required. |
| `SRCLY_CACHE_DIR` | Select the local analysis cache directory. |
| `SRCLY_FINDINGS_TIMEOUT` | Set the timeout for checker jobs. |
| `SRCLY_DATAFLOW_TIMEOUT` | Override data-flow request timeouts. |
| `SRCLY_AST_GREP` | Select the ast-grep executable and override project and `PATH` discovery. |

Cache data is stored in your user cache directory, not in the analyzed repository. A changed file or checker signature can trigger fresh analysis. Use `--refresh` when a command supports it and you need to rerun the checks without relying on cached results.

## Troubleshoot a missing result

| Symptom | Check | Next step |
| --- | --- | --- |
| Data flow says not analyzed | Node version and `SRCLY_NODE`; project type detection and supported language | Install or select Node 18+, then rerun. If the code pattern is unsupported, treat it as an evidence limit. |
| Checker coverage is N/A | Report's `Analysis:` line and checker reason | Install/configure the project tool or accept the gap; use `--refresh` after setup changes. |
| Reachability marks an entry file unused | Detected entries and dynamic imports | Add an entry glob in `srcly.toml`, then refresh. Confirm any finding against the runtime. |
| ast-grep has no results or is unavailable | Rule file location, YAML extension, binary discovery | Put files in `.srcly/rules/` and install or select ast-grep. |
| Metrics appear as N/A | Node type, language support, analyzer status, or missing history | Read the reason; N/A means unavailable or not applicable, not zero. |

For the full command list, use the [CLI reference](../cli/). For N/A interpretation, see [Metrics](../metrics/); for checker behavior, see [Findings](../findings/).
