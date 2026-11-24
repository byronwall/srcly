// Callees whose implementation is or is not in the program (W18). Nothing here runs.

// (a) Declared, never implemented: the analysis cannot see what it does.
export declare function obtainExternalNote(id: string): string;

// (b) The same signature with a pure body.
export function obtainLocalNote(id: string): string {
  return id.trim();
}

// (c) Overload signatures before an effectful implementation.
export function overloaded(id: string): string;
export function overloaded(id: number): string;
export function overloaded(id: string | number): string {
  console.log(id);
  return `${id}`;
}

// (d) An effectful helper.
export function effectfulHelper(id: string): string {
  console.log(id);
  return id;
}

export interface NoteSource {
  read(id: string): string;
}
