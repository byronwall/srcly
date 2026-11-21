# Trace function saveName (src/function-body.ts:6)

- anchor `saveName` src/function-body.ts:6 ((name: string, store: Storage) => number)
- direction forward · status `ok` · null-proof yes

## Origins (0)
- none drawn

## Ends (2)
- external-effect `browser write: store.setItem(…)` src/function-body.ts:7
- return `return` src/function-body.ts:8

## Paths (2 origin→end pairs: 0 in × 2 out; a pair's path is its in, then its out)
- out: browser write: store.setItem(…) src/function-body.ts:7
    src/function-body.ts:6  anchor  saveName
    src/function-body.ts:6  parameter  store
    src/function-body.ts:7  references  store
    src/function-body.ts:7  field-input .setItem  setItem
    src/function-body.ts:7  references  store.setItem("name", name.trim())
    src/function-body.ts:7  effect-input  browser write: store.setItem(…)
- out: return src/function-body.ts:8
    src/function-body.ts:6  anchor  saveName
    src/function-body.ts:6  parameter  name
    src/function-body.ts:8  references  name
    src/function-body.ts:8  field-input .length  length
    src/function-body.ts:8  return-expression  return

## Stops (0)
- none

## Functions crossed (1)
- helper `saveName` src/function-body.ts:6 (13 boxes)
