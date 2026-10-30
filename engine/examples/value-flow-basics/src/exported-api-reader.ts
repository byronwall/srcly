import * as api from "./exported-api";

// Reads an export through its module's namespace: `READ_BY_NAMESPACE` is read in the program.
export function viaNamespace(): string {
  return api.READ_BY_NAMESPACE.label; // @reaches by-namespace return
}
