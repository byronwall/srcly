# Trace function saveName (src/function-body.ts:6)

- anchor `saveName` src/function-body.ts:6 ((name: string, store: Storage) => number)
- direction forward · status `ok` · null-proof yes

## Origins (0)
- none drawn

## Ends (2)
- external-effect `browser write: store.setItem(…)` src/function-body.ts:7
- return `return` src/function-body.ts:8

## Paths (2)
- saveName → browser write: store.setItem(…)
    src/function-body.ts:6  anchor  saveName
    src/function-body.ts:6  parameter  store
    src/function-body.ts:7  references  store
    src/function-body.ts:7  field-input .setItem  setItem
    src/function-body.ts:7  references  store.setItem("name", name.trim())
    src/function-body.ts:7  effect-input  browser write: store.setItem(…)
- saveName → return
    src/function-body.ts:6  anchor  saveName
    src/function-body.ts:8  returns  return

## Stops (0)
- none

## Functions crossed (1)
- helper `saveName` src/function-body.ts:6 (13 boxes)
