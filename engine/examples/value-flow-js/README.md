# Value-flow in actual JavaScript

Fixtures in real `.js`, `.jsx` and `.cjs` files, with no types and no JSDoc. `engine/test/srcly/fixture-annotations.test.ts` checks their claims as it does `value-flow-basics`, and first checks that each file is in the Program.

This root is apart from `value-flow-basics` so a `.ts` file of the same name cannot stand in for a `.js` file. Its config is strict, `allowJs` is on and `checkJs` is off.

- `identity.js`: one helper called twice. Each call's value stays with that call.
- `esm-entry.mjs`, `cjs-helper.cjs`: a `.mjs` file nothing imports, which is in the Program as a root, and a value that crosses `require` into CommonJS and comes back.
