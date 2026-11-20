import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { renderPage } from "../.ssr/server.js";

const origin = "https://byronwall.github.io";
const base = "/srcly/";
const template = await readFile("dist/index.html", "utf8");
const escape = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const pages = [{
  route: "",
  title: "Srcly — See where your code needs attention",
  description: "Explore your codebase as a treemap. Find complexity, inspect findings, trace data flow, and give coding agents focused reports. Run Srcly locally with uvx srcly.",
}];

for (const filename of (await readdir("src/docs/pages")).filter((name) => name.endsWith(".md"))) {
  const markdown = await readFile(`src/docs/pages/${filename}`, "utf8");
  const title = markdown.match(/^# (.+)$/m)?.[1];
  assert(title, `Missing page title: ${filename}`);
  const description = markdown.split(/\n\s*\n/).find((block) => !block.startsWith("#"))
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_]/g, "").replace(/\s+/g, " ").slice(0, 200);
  assert(description, `Missing page introduction: ${filename}`);
  const slug = filename.slice(0, -3);
  pages.push({ route: slug === "overview" ? "docs/" : `docs/${slug}/`, title: `${title} · Srcly docs`, description });
}

function html(page) {
  const canonical = `${origin}${base}${page.route}`;
  const metadata = [
    `<meta name="description" content="${escape(page.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    page.route.startsWith("docs/") ? `<link rel="alternate" type="text/markdown" href="${canonical}index.md" />` : `<link rel="alternate" type="text/plain" title="llms.txt" href="${origin}${base}llms.txt" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Srcly" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${origin}${base}screenshots/treemap.jpg" />`,
    `<meta property="og:image:alt" content="Srcly inspecting its own client code in the treemap view" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
  assert.equal(template.match(/<title>.*?<\/title>/g)?.length, 1);
  assert.equal(template.match(/<!-- page-meta -->/g)?.length, 1);
  assert.equal(template.match(/<div id="root"><\/div>/g)?.length, 1);
  return template
    .replace(/<title>.*?<\/title>/, `<title>${escape(page.title)}</title>`)
    .replace("<!-- page-meta -->", metadata)
    .replace('<div id="root"></div>', () => `<div id="root">${renderPage(`${base}${page.route}`)}</div>`);
}

for (const page of pages) {
  const directory = `dist/${page.route}`;
  await mkdir(directory, { recursive: true });
  const content = html(page);
  for (const match of content.matchAll(/<img[^>]+src="(\/srcly\/screenshots\/[^"?#]+)"/g)) {
    const asset = await readFile(`dist/${match[1].slice(base.length)}`);
    assert(asset.length > 0, `Missing screenshot in ${page.route}: ${match[1]}`);
  }
  await writeFile(`${directory}/index.html`, content);
}

// Keep the overview alias readable on static hosts, including without JavaScript.
const overview = pages.find((page) => page.route === "docs/");
assert(overview, "The docs need an overview page");
await mkdir("dist/docs/overview", { recursive: true });
await writeFile("dist/docs/overview/index.html", html(overview));
await writeFile("dist/404.html", html({ route: "404/", title: "Page not found · Srcly", description: "Find Srcly documentation and setup guides." }).replace('<meta property="og:type"', '<meta name="robots" content="noindex" /><meta property="og:type"'));
await writeFile("dist/.nojekyll", "");
await writeFile("dist/robots.txt", `User-agent: *\nAllow: /\nSitemap: ${origin}${base}sitemap.xml\n`);
await writeFile("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${origin}${base}${page.route}</loc></url>`).join("")}</urlset>\n`);
// For agents: each guide as Markdown beside its page, llms.txt as the index, llms-full.txt as everything.
const absolute = (markdown) => markdown
  .replace(/<figure>.*?<img src="([^"]+)" alt="([^"]+)".*?<\/figure>/gs, (_m, src, alt) => `![${alt}](${origin}${src})`)
  .replace(/\]\(\.\.\/([a-z0-9-]+)\/?(#[^)]+)?\)/gi, (_m, slug, hash = "") => `](${origin}${base}docs/${slug}/${hash})`)
  .replace(/\]\(\/srcly\//g, `](${origin}${base}`);
const guides = [];
const order = ["overview", "tour", "design", "get-started", "explore", "metrics", "findings", "data-flow", "reports", "cli", "configuration"];
const slugs = (await readdir("src/docs/pages")).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3));
assert.deepEqual([...slugs].sort(), [...order].sort(), "Add new guides to the llms.txt order");
for (const slug of order) {
  const filename = `${slug}.md`;
  const markdown = absolute(await readFile(`src/docs/pages/${filename}`, "utf8"));
  const page = pages.find((item) => item.route === (slug === "overview" ? "docs/" : `docs/${slug}/`));
  await writeFile(`dist/docs/${slug}/index.md`, markdown);
  if (slug === "overview") await writeFile("dist/docs/index.md", markdown);
  guides.push({ slug, title: markdown.match(/^# (.+)$/m)[1], description: page.description.split(/(?<=\.)\s/)[0], markdown });
}
const catalog = JSON.parse(await readFile("src/data/catalog.json", "utf8"));
const meta = JSON.parse(await readFile("src/data/meta.json", "utf8"));
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const metrics = [
  "# Srcly metrics",
  "",
  `Every metric Srcly measures, from its metric catalog (version ${meta.version}). Rollup is how a folder or file combines its children; "max, named" also names the function that sets it. N/A means the metric does not apply or its tool did not run. It is never 0.`,
  ...catalog.groups.flatMap((group) => [
    "", `## ${group.id}`, "", group.description, "",
    "| Metric | ID | Rollup | Languages | What it measures |", "| --- | --- | --- | --- | --- |",
    ...catalog.metrics.filter((metric) => metric.group === group.id).map((metric) =>
      `| ${cell(metric.label)} | \`${metric.id}\` | ${metric.aggregation === "max" && metric.witness ? "max, named" : metric.aggregation} | ${cell((metric.languages ?? ["any file"]).join(", "))} | ${cell(metric.description)} |`),
  ]),
].join("\n") + "\n";
await writeFile("dist/metrics.md", metrics);
const site = `${origin}${base}`;
await writeFile("dist/llms.txt", `# Srcly

> Srcly is a local codebase map for developers and coding agents. It scans a repository into folders, files, functions and nested scopes, measures complexity, size, comment noise, React and Solid components, Git activity and lint findings, and shows them as a treemap, graphs and a 2x2 in the browser. Headless commands write the same analysis as Markdown and JSON.

Run it with \`uvx srcly\` (needs uv; Python 3.13+). Version ${meta.version}. Full analysis for TypeScript, JavaScript and Python; size and complexity for the other languages Lizard reads. A metric that does not apply is N/A, never 0.

For an agent, the usual loop is:

1. \`uvx srcly report . --out .srcly\`, then read \`.srcly/report.md\`.
2. \`uvx srcly explain . --at <folder | file | file::symbol>\` to drill in. Each answer ends with a \`Next:\` command.
3. \`uvx srcly compare --json\` to see what a change did, and \`uvx srcly check . --ratchet\` to stop big files from growing.

## Guides

${guides.map((guide) => `- [${guide.title}](${site}docs/${guide.slug}/index.md): ${guide.description}`).join("\n")}

## Reference

- [Metrics](${site}metrics.md): every metric with its ID, rollup, languages and definition.
- [Agent skill](https://raw.githubusercontent.com/byronwall/srcly/main/skills/srcly-code-quality/SKILL.md): the report and explain workflow as a skill file.
- [Source](https://github.com/byronwall/srcly): the repository.

## Optional

- [Everything in one file](${site}llms-full.txt): every guide and the metric reference.
`);
await writeFile("dist/llms-full.txt", [
  `# Srcly documentation\n\nAll guides and the metric reference, from ${site}. Version ${meta.version}.`,
  ...guides.map((guide) => `\n---\n\nSource: ${site}docs/${guide.slug}/\n\n${guide.markdown.trim()}`),
  `\n---\n\nSource: ${site}metrics.md\n\n${metrics.trim()}`,
].join("\n") + "\n");
console.log(`Prerendered ${pages.length} pages, docs entry point, and 404 page. Wrote llms.txt, llms-full.txt, metrics.md and ${guides.length} Markdown guides.`);
