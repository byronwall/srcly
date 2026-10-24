import { format } from "node:util";

// stdout carries protocol frames only. Any `console.log` in analysis code
// would corrupt the channel, so the log-level console methods write to stderr.
// Import this module first, before any analysis module runs.
const toStderr = (...values: unknown[]) => {
  process.stderr.write(`${format(...values)}\n`);
};
console.log = toStderr;
console.info = toStderr;
console.debug = toStderr;
