# Route field proof acceptance

Use the maintained runner to check one selected source against named semantic
field-to-consumer obligations. Use a file locator for the source. Source keys
are generated during analysis and can change.

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-obligations.json
```

The runner accepts a source key, a `file:line[:column]` locator, or a unique
source label. It prints the selected origin, field paths, attachment and
transformation counts, consumer-terminal relations, frontiers, obligation
IDs, missing dependencies, a deterministic semantic result hash, and payload
size.

## Current route slices

The generic fixture contains G01 through G20. It covers direct scalar uses,
direct collection uses, whole-object uses, and scalar aliases.

The schedule route slice adds G21 for `players[*].displayName`. G21 requires
the collection-membership dependency described below:

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json
```

G21 has an explicit dependency requirement. The target remains
`players[*].displayName`. Its dependency source is
`availability[*].playerId`. The source dependency proves the filtered
availability rows, mapped player IDs, and exact `includes(player.id)` join.

An ordinary attachment proves a selected field reaches one consumer and one
occurrence-owned terminal. A collection-membership dependency explains why a
target collection member is present. It is stored on the target attachment.
It does not become an extra owner field or an ordinary consumer use.

## Positive gate

The positive gate fails when any of these conditions holds:

- no positive field attachment is proven;
- selected field paths are empty;
- a named obligation is missing;
- an unexpected or duplicate semantic record exists;
- proven consumer-terminal relations do not meet the obligation count;
- an attachment does not have exactly one occurrence-owned terminal;
- a consumer does not have exactly one proven exact terminal relation;
- a required field path ends at a frontier; or
- a required collection-membership dependency is missing.

Counts do not satisfy an obligation. Each obligation compares the field path,
canonical target record, consumer label, consumer kind, alias, and required
dependency. The proof identity includes the selected source, field path,
consumer target, occurrence ID, terminal ID, and consumer-terminal relation ID.
The semantic hash changes when any of these identities changes.

## Exact failure probes

Use in-memory probes. They do not change fixture data. Each command must exit
nonzero and identify the simulated obligation:

```sh
pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json \
  --simulate-missing G21

pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json \
  --simulate-label G21

pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json \
  --simulate-kind G21

pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json \
  --simulate-alias G21

pnpm accept:route-field-proof \
  --root /Users/byronwall/Projects/soccer-schedule/app \
  --route '/games/[gameId]/schedule' \
  --source src/lib/soccer/store-persistence.ts:96:40 \
  --obligations scripts/route-field-proof-soccer-schedule-direct.json \
  --simulate-duplicate G21
```

The runner rejects unknown IDs and more than one simulation flag. These probes
check field identity, consumer identity, kind, alias, and uniqueness. They do
not replace a negative source example. Add a fail-closed source case for each
new transform.

## Fresh-process and browser evidence

Run acceptance comparisons from fresh analyzer processes. Do not compare a run
from a service that another worker is changing. Record the analyzer and
frontend commit, port, project root, generation, and asset mode for browser
evidence. Use a fresh service for each browser check.

Browser evidence must show the normal user control, the selected field, its
consumer and proof, and any honest frontiers. Check both a positive field and
a negative precision case. Compare deterministic hashes, not elapsed time or
generated IDs.

## Failure history and contracts

The first failure was an ordering gap. The analyzer materialized candidate
field evidence and terminal facts in the index, but it did not synchronize
those facts into the selected route slice before it anchored the field proof.
The route then reported zero attachments even though the evidence existed.

A later projection failure exposed a contract error. A frontier for an exact
field carried only part of the field path. Route Totality projection requires
every exact field element. A frontier with an exact field must carry the full
ordered field identity. If no exact field identity exists, set `field` to
`null` and retain the typed reason and evidence path. Never emit a partial
field object as an exact frontier.

The runner is the authority for named field-to-consumer proof. The fixture
obligations are acceptance data. They do not define generic discovery policy.
