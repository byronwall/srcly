# Value-flow in actual JavaScript

Fixtures in real `.js`, `.jsx` and `.cjs` files, with no types and no JSDoc. `engine/test/srcly/fixture-annotations.test.ts` checks their claims as it does `value-flow-basics`, and first checks that each file is in the Program.

This root is apart from `value-flow-basics` so a `.ts` file of the same name cannot stand in for a `.js` file. Its config is strict, `allowJs` is on and `checkJs` is off.

- `identity.js`: one helper called twice. Each call's value stays with that call.
- `esm-entry.mjs`, `cjs-helper.cjs`: a `.mjs` file nothing imports, which is in the Program as a root, and a value that crosses `require` into CommonJS and comes back.
- `constructor-functions.js`: `new Account(owner)` runs a constructor function, and a method assigned to `Account.prototype` reads the member back. A member nothing reads stops there.
- `untyped-receivers.js`: a method call on an untyped parameter stays a named stop; one on a value parsed from JSON is the standard method.
