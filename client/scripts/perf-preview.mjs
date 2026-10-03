#!/usr/bin/env node
// Development-only server for comparing client builds with a deterministic tree.
// Run from client: pnpm exec node scripts/perf-preview.mjs --port=8101 --dist=../tmp/baseline-dist
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const value = args.find((arg) => arg.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};
const port = Number(option("port", "8101"));
const dist = path.resolve(process.cwd(), option("dist", "dist"));
if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw new Error(`No index.html in selected dist: ${dist}`);
}

const rootPath = "/srcly-performance-fixture";
const groups = 18;
const modulesPerGroup = 7;
const filesPerModule = 18;
const functionsPerFile = 11;
const files = new Map();
const children = new Map();
const folders = [rootPath];
const addChild = (parent, item) => {
  const list = children.get(parent) ?? [];
  list.push(item);
  children.set(parent, list);
};

const metric = (seed, loc, fileSize = loc * 44) => ({
  loc,
  complexity: 1 + (seed % 13),
  function_count: functionsPerFile,
  last_modified: 1725000000 + seed * 73,
  gitignored_count: seed % 17 === 0 ? 1 : 0,
  file_size: fileSize,
  file_count: 1,
  comment_lines: seed % 9,
  comment_density: (seed % 9) / Math.max(loc, 1),
  max_nesting_depth: 1 + (seed % 6),
  average_function_length: Math.max(4, Math.floor(loc / functionsPerFile)),
  parameter_count: seed % 5,
  todo_count: seed % 19 === 0 ? 1 : 0,
  classes_count: seed % 4 === 0 ? 1 : 0,
  tsx_nesting_depth: seed % 5,
  tsx_render_branching_count: seed % 7,
  tsx_react_use_effect_count: seed % 3,
  tsx_anonymous_handler_count: seed % 6,
  tsx_prop_count: seed % 9,
  ts_any_usage_count: seed % 8,
  ts_ignore_count: seed % 23 === 0 ? 1 : 0,
  ts_import_coupling_count: 1 + (seed % 10),
  tsx_hardcoded_string_volume: seed % 31,
  tsx_duplicated_string_count: seed % 4,
  ts_type_interface_count: seed % 5,
  ts_export_count: functionsPerFile,
  python_import_count: 0,
  md_data_url_count: seed % 41 === 0 ? 1 : 0,
});

function sourceFor(seed) {
  const lines = [];
  for (let i = 1; i <= functionsPerFile; i++) {
    if (lines.length) lines.push("");
    lines.push(
      `export function transform${String(i).padStart(2, "0")}(value: number) {`,
      `  const offset = ${(seed + i) % 17};`,
      "  if (value > offset) return value - offset;",
      "  return value + offset;",
      "}"
    );
  }
  return lines.join("\n") + "\n";
}

const root = {
  name: "srcly-performance-fixture",
  path: rootPath,
  type: "folder",
  metrics: { loc: 180000, complexity: 7.1, file_size: 10000000, file_count: groups * modulesPerGroup * filesPerModule, function_count: groups * modulesPerGroup * (filesPerModule - 1) * functionsPerFile },
  children: [],
};
let seed = 0;
for (let g = 1; g <= groups; g++) {
  const groupPath = `${rootPath}/group-${String(g).padStart(2, "0")}`;
  const group = { name: `group-${String(g).padStart(2, "0")}`, path: groupPath, type: "folder", metrics: { loc: 10000, complexity: 6, file_count: modulesPerGroup * filesPerModule }, children: [] };
  root.children.push(group);
  folders.push(groupPath);
  for (let m = 1; m <= modulesPerGroup; m++) {
    const modulePath = `${groupPath}/module-${String(m).padStart(2, "0")}`;
    const module = { name: `module-${String(m).padStart(2, "0")}`, path: modulePath, type: "folder", metrics: { loc: 1400, complexity: 6, file_count: filesPerModule }, children: [] };
    group.children.push(module);
    folders.push(modulePath);
    for (let f = 1; f <= filesPerModule; f++) {
      seed++;
      const isMarkdown = f === 1;
      const ext = isMarkdown ? "md" : f % 5 === 0 ? "tsx" : "ts";
      const name = `${isMarkdown ? "guide" : `feature-${String(f - 1).padStart(2, "0")}`}.${ext}`;
      const filePath = `${modulePath}/${name}`;
      const fileLines = isMarkdown ? 18 : functionsPerFile * 6 - 1;
      const fileNode = { name, path: filePath, type: "file", start_line: 1, end_line: fileLines, metrics: metric(seed, fileLines, isMarkdown ? 920 : fileLines * 52), children: [] };
      if (!isMarkdown) {
        const code = sourceFor(seed);
        files.set(filePath, code);
        for (let i = 1; i <= functionsPerFile; i++) {
          const start = (i - 1) * 6 + 1;
          fileNode.children.push({
            name: `transform${String(i).padStart(2, "0")}`,
            path: `${filePath}::transform${String(i).padStart(2, "0")}`,
            type: "function",
            start_line: start,
            end_line: start + 4,
            metrics: { ...metric(seed + i, 5, 260), file_count: 0, function_count: 1 },
            children: [],
          });
        }
      } else {
        files.set(filePath, `# ${module.name} guide\n\nThis deterministic Markdown file is part of the Srcly performance fixture.\n\nIt gives the source viewer a real document alongside the generated TypeScript files.\n`);
      }
      module.children.push(fileNode);
      addChild(modulePath, { name, path: filePath, type: "file" });
    }
    addChild(groupPath, { name: module.name, path: modulePath, type: "folder" });
  }
  addChild(rootPath, { name: group.name, path: groupPath, type: "folder" });
}
function aggregate(node) {
  if (!node.children.length) return node.metrics;
  const metrics = node.children.map(aggregate);
  if (node.type !== "folder") return node.metrics;
  const sum = (key) => metrics.reduce((total, item) => total + (item[key] || 0), 0);
  const max = (key) => Math.max(0, ...metrics.map((item) => item[key] || 0));
  Object.assign(node.metrics, {
    loc: sum("loc"), complexity: max("complexity"), function_count: sum("function_count"),
    last_modified: max("last_modified"), gitignored_count: sum("gitignored_count"),
    file_size: sum("file_size"), file_count: sum("file_count"), comment_lines: sum("comment_lines"),
    comment_density: sum("comment_lines") / Math.max(1, sum("loc")), max_nesting_depth: max("max_nesting_depth"),
    average_function_length: metrics.reduce((total, item) => total + item.average_function_length * item.function_count, 0) / Math.max(1, sum("function_count")),
    parameter_count: sum("parameter_count"), todo_count: sum("todo_count"), classes_count: sum("classes_count"),
    tsx_nesting_depth: max("tsx_nesting_depth"), tsx_render_branching_count: sum("tsx_render_branching_count"),
    tsx_react_use_effect_count: sum("tsx_react_use_effect_count"), tsx_anonymous_handler_count: sum("tsx_anonymous_handler_count"),
    tsx_prop_count: sum("tsx_prop_count"), ts_any_usage_count: sum("ts_any_usage_count"),
    ts_ignore_count: sum("ts_ignore_count"), ts_import_coupling_count: sum("ts_import_coupling_count"),
    tsx_hardcoded_string_volume: sum("tsx_hardcoded_string_volume"), tsx_duplicated_string_count: sum("tsx_duplicated_string_count"),
    ts_type_interface_count: sum("ts_type_interface_count"), ts_export_count: sum("ts_export_count"),
    python_import_count: sum("python_import_count"), md_data_url_count: sum("md_data_url_count"),
  });
  return node.metrics;
}
aggregate(root);
const fileCount = groups * modulesPerGroup * filesPerModule;
const functionCount = groups * modulesPerGroup * (filesPerModule - 1) * functionsPerFile;
const nodeCount = 1 + groups + groups * modulesPerGroup + fileCount + functionCount;
const jobs = new Map();
const json = (res, value, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(value));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/analysis/context") {
    return json(res, { root_path: rootPath, file_count: fileCount, folder_count: folders.length - 1, repo_root_path: rootPath, repo_file_count: fileCount, repo_folder_count: folders.length - 1 });
  }
  if (req.method === "GET" && url.pathname === "/api/files/suggest") {
    const requested = url.searchParams.get("path") || "";
    const current = requested.replace(/\/$/, "");
    const matches = children.get(current) ?? [];
    const items = matches.length ? matches : [{ name: root.name, path: rootPath, type: "folder" }].filter((item) => item.path.startsWith(current));
    return json(res, { items: items.slice(0, 80) });
  }
  if (req.method === "GET" && url.pathname === "/api/files/content") {
    const text = files.get(url.searchParams.get("path") || "");
    if (text === undefined) return json(res, { detail: "Fixture file not found" }, 404);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    return res.end(text);
  }
  if (req.method === "POST" && url.pathname === "/api/scans") {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const id = `fixture-${Date.now().toString(36)}`;
      const pathValue = JSON.parse(body || "{}").path || rootPath;
      const snapshot = { id, path: pathValue, phase: "complete", version: 1, files_discovered: fileCount, files_total: fileCount, files_done: fileCount, files_failed: 0, current_path: null, elapsed_seconds: 0.08, error: null, failures: [], in_progress: [] };
      jobs.set(id, { snapshot, result: root });
      json(res, snapshot, 202);
    });
    return;
  }
  const scan = url.pathname.match(/^\/api\/scans\/([^/]+)(?:\/(events|result))?$/);
  if (scan) {
    const job = jobs.get(decodeURIComponent(scan[1]));
    if (!job) return json(res, { detail: "Scan not found" }, 404);
    if (req.method === "DELETE") return json(res, job.snapshot);
    if (scan[2] === "result") return json(res, job.result);
    if (scan[2] === "events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
      res.end(`event: complete\ndata: ${JSON.stringify(job.snapshot)}\n\n`);
      return;
    }
    return json(res, job.snapshot);
  }

  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch { return json(res, { detail: "Bad path" }, 400); }
  const target = path.resolve(dist, `.${requested === "/" ? "/index.html" : requested}`);
  if (target !== dist && !target.startsWith(dist + path.sep)) return json(res, { detail: "Not found" }, 404);
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(dist, "index.html");
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
  res.writeHead(200, { "Content-Type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Srcly fixture at http://127.0.0.1:${port} (${nodeCount.toLocaleString()} nodes, ${fileCount.toLocaleString()} files)`);
  console.log(`Serving ${dist}`);
});
