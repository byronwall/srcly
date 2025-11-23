---
trigger: always_on
---

# Package Management

Use `pnpm` for all package management operations.

- Install: `pnpm install`
- Add: `pnpm add <package>`
- Run: `pnpm run <script>`
- Direct run: `pnpm dlx ...`

When adding deps, always call `pnpm add` instead of modifying package.json directly.
