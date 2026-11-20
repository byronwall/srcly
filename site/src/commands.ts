/** The headless commands, as the CLI table and the site search show them. Keep in sync with `server/app/run.py`. */
export const COMMANDS: [string, string][] = [
  ['srcly [path]', 'Scan and open the app. --host and --port pick the bind address.'],
  ['srcly report', 'Write report.md and JSON artifacts: findings, folders, hotspots, a tree summary, the metric schema and an agent guide. --quadrant adds a 2×2.'],
  ['srcly explain --at', 'Drill into the repo, a folder, a file, or file::symbol. Any printed "start at" value works.'],
  ['srcly hotspots', 'Rank files or functions by one metric. --format json for scripts.'],
  ['srcly compare [base] [head]', 'Metric and dependency changes between two refs. Defaults to the merge base against the working tree; pr:<n> names a PR.'],
  ['srcly fix', 'Print a diff of safe fixes for srcly\'s own findings; --write applies them.'],
  ['srcly check --ratchet', 'Exit 1 when a file over the size budget grows.'],
  ['srcly scan', 'Write the raw analysis tree as JSON.'],
];
