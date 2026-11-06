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
The browser adds the interactive example, guide search, and copy buttons.

Edit user guides in `src/docs/pages/`. Keep command examples in sync with `server/app/run.py`.
Add new pages to the navigation in `src/App.tsx` when required.
The build reads page titles and introductions from Markdown for search metadata.

The site uses its own dependencies and build. It does not ship inside the Python wheel.
Pull requests build the site and run its browser checks. See [DEPLOY.md](DEPLOY.md) to publish the build to GitHub Pages.

## Reference and design

Draftably's public site supplied the structure: an interactive product example, direct setup actions, and searchable task guides.
Srcly keeps its light surfaces, blue links, Inter type, and IBM Plex Mono commands.
The treemap uses clearly labeled example data. It does not scan visitor files.

## Verification

`pnpm test` runs a browser against the built site under `/srcly/`.
It checks direct guide links, rendered content, navigation, search, the example controls, and narrow screens.
Keep screenshot evidence under the repository's ignored `tmp/` directory.
