// Nothing imports this file, so only a root filter that knows `.mjs` puts it in the Program.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shout } = require("./cjs-helper.cjs");

export function loud(text) {
  const value = shout(text); // @trace js-mjs forward text @no-path js-mjs "text" "quiet"
  console.log(value); // @reaches js-mjs stdout @reaches js-mjs external-effect
  const quiet = "ok";
  return quiet;
}
