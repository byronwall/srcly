import { Chip } from "./closure-props";

export function ChipHost() {
  return <Chip tone="warm" count={2} />; // @visits chip literal ""warm"" @visits chip literal "2"
}
