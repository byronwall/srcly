import main, { tick, Runner } from "lib";
import * as lib from "lib";

export function app() {
  tick();
  lib.tick();
  new Runner().run();
  new lib.Runner()["run"]();
  return main();
}
import { run } from "kit/entry";
export const mapped = run();
