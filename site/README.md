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

Edit the product tour, design notes, and user guides in `src/docs/pages/`.
Keep command examples in sync with `server/app/run.py`.
Add new pages to the navigation in `src/App.tsx` when required.
The build reads page titles and introductions from Markdown for search metadata.

The site uses its own dependencies and build. It does not ship inside the Python wheel.
Pull requests build the site and run its browser checks. See [DEPLOY.md](DEPLOY.md) to publish the build to GitHub Pages.

## Reference and design

Draftably's public site supplied the structure: a product preview, direct setup actions, and searchable task guides.
Srcly keeps its light surfaces, blue links, Inter type, and IBM Plex Mono commands.
Real app screenshots show Srcly inspecting its public source and checked-in fixtures.
Capture provenance is in `public/screenshots/README.md`. The site does not scan visitor files.
The docs have three groups: Discover, Use Srcly, and Automate & configure.

## Verification

`pnpm test` runs a browser against the built site under `/srcly/`.
It checks static guide content, local links, images, search anchors, screenshot zoom, copy feedback, and narrow screens.
Keep screenshot evidence under the repository's ignored `tmp/` directory.
