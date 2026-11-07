# Deploy

Build the static site, then deploy it from the repository checkout:

```sh
cd site
pnpm build
node scripts/deploy.mjs
```

The script publishes `dist/` to the `gh-pages` branch and adds `.nojekyll`.
It uses a temporary clone, keeps existing branch history, and pushes without force.
The commit author and committer are Byron Wall (`byron@byroni.us`).
