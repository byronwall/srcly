// Callers of opaque.ts, one per case. Nothing here runs.
import { effectfulHelper, type NoteSource, obtainExternalNote, obtainLocalNote, overloaded } from "./opaque";

export function callsDeclaredOnly(id: string) {
  return obtainExternalNote(id);
}

export function callsPureBody(id: string) {
  return obtainLocalNote(id);
}

export function callsOverloaded(id: string) {
  return overloaded(id);
}

export function callsEffectfulHelper(id: string) {
  return effectfulHelper(id);
}

export function callsInterfaceMethod(source: NoteSource, id: string) {
  return source.read(id);
}
