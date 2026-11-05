from app.services.findings.async_loops import check_source

SOURCE = b"""
export async function rollup() {
  const docs = await prisma.doc.findMany();
  for (const doc of docs) {                       // 4: flagged, [db]
    await prisma.snapshot.upsert({ where: { id: doc.id } });
  }
  let cursor = await first();
  while (cursor) {                                // pagination: the header reads the awaited value
    const page = await next(cursor);
    cursor = page.nextCursor;
  }
  for (let i = 0; i < 3; i++) {                   // retry: the exit is guarded by the result
    const res = await send();
    if (res.ok) break;
  }
  await prisma.$transaction(async (tx) => {
    for (const id of ids) await tx.item.update({ where: { id } });   // ordered inside a transaction
  });
  for (const chunk of chunks) await Promise.all(chunk.map(save));    // a chunked batch
  for (const id of ids) {                         // 20: flagged
    await notify(id);
  }
}
"""


def test_await_in_loop_flags_independent_awaits_only() -> None:
    found = check_source("x.ts", SOURCE, "srcly-async")
    assert [(f.line, f.message.startswith("[db]")) for f in found] == [(4, True), (20, False)]
