# Srcly public site

The landing page and user guides deploy to [GitHub Pages](https://byronwall.github.io/srcly/).
The analysis app still runs locally through `uvx srcly`.

```sh
cd site
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
```

Open the printed development URL with `/srcly/` appended.
The build writes `site/dist/`. Each guide has a complete HTML page, with page metadata and a canonical URL.
The browser adds section-linked guide search, copy buttons, and a full-size screenshot viewer.

## Content

- The landing page (`src/Landing.tsx`) is the user guide in one page: install, how to read the treemap, the views, workflows, the command line, a reference, and a short "How I built it".
- The reference tables (`src/Reference.tsx`) read `src/data/catalog.json`, Srcly's own metric catalog. Do not retype metric definitions.
- The longer guides are Markdown in `src/docs/pages/`. Add a new page to the navigation in `src/App.tsx`.
- Keep command examples in sync with `server/app/run.py`.

## Screenshots and data

`node scripts/capture.mjs [name,name…]` captures everything from a real Srcly run on Srcly's own source.
It clones this checkout's HEAD to a temporary `srcly` folder, starts the API and client on free ports with a temporary cache, and writes:

- `public/screenshots/*.jpg`: the app at 1440 × 900 CSS pixels, 1.5x.
- `src/data/tree.json`: folder and file LOC and complexity, for the treemaps drawn on the page.
- `src/data/catalog.json`: the metric catalog and 2×2 presets.
- `src/data/cli.json`: real `hotspots` and `explain` output.
- `src/data/meta.json`: the source revision and totals the page cites.

It needs the server venv (`cd server && uv sync`), client `node_modules`, and Google Chrome.
A full run takes about five minutes, most of it the compare shot, which scans two revisions.
Rerun it after a release that changes the UI, and commit the screenshots and data together.

## Deploy

`.github/workflows/pages.yml` builds the site and publishes `site/dist` on every push to `main` that touches `site/`.
Pages must use **Settings › Pages › Source: GitHub Actions**. Run the workflow by hand from the Actions tab to publish without a site change.
Pull requests run `.github/workflows/site.yml`: the build and the browser checks.

## Verification

`pnpm test` runs a browser against the built site under `/srcly/`.
It checks the landing page, static guide content, local links, images, search anchors, screenshot zoom, copy feedback, and narrow screens.
Keep screenshot evidence under the repository's ignored `tmp/` directory.
