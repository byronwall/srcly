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
  pages.push({ route: `docs/${filename.slice(0, -3)}/`, title: `${title} · Srcly docs`, description });
}

function html(page) {
  const canonical = `${origin}${base}${page.route}`;
  const metadata = [
    `<meta name="description" content="${escape(page.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Srcly" />`,
    `<meta property="og:title" content="${escape(page.title)}" />`,
    `<meta property="og:description" content="${escape(page.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta name="twitter:card" content="summary" />`,
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
  await writeFile(`${directory}/index.html`, html(page));
}

// Keep the docs entry point readable on static hosts, including without JavaScript.
const start = pages.find((page) => page.route === "docs/get-started/");
assert(start, "The docs need a get-started page");
await writeFile("dist/docs/index.html", html(start));
await writeFile("dist/404.html", html({ route: "404/", title: "Page not found · Srcly", description: "Find Srcly documentation and setup guides." }).replace('<meta property="og:type"', '<meta name="robots" content="noindex" /><meta property="og:type"'));
await writeFile("dist/.nojekyll", "");
await writeFile("dist/robots.txt", `User-agent: *\nAllow: /\nSitemap: ${origin}${base}sitemap.xml\n`);
await writeFile("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${origin}${base}${page.route}</loc></url>`).join("")}</urlset>\n`);
console.log(`Prerendered ${pages.length} pages, docs entry point, and 404 page.`);
