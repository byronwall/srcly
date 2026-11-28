import main, { tick, Runner } from "lib";
import * as lib from "lib";
import { run } from "kit/entry";

export function app() {
  tick();
  lib.tick();
  new Runner().run();
  new lib.Runner()["run"]();
  return main();
}
export const mapped = run();
