import { describe, expect, it } from "vitest";
import snapshot from "../../../server/tests/snapshots/ranking-parity.json";
import { cohortNodes, rankHotSpots, type HotSpotCohort, type RankableNode } from "./hotSpotRanking";

/**
 * `srcly report` ranked `server/tests/fixtures` and stored its top 10 per
 * metric and cohort, beside the scanned tree (`server/tests/test_ranking_parity.py`
 * writes and checks it). The client must rank that tree the same way.
 */
type Parity = { top: number; expected: Record<string, [string, number][]>; tree: RankableNode };

const parity = snapshot as unknown as Parity;

describe("ranking parity with srcly report", () => {
  for (const [key, expected] of Object.entries(parity.expected)) {
    it(`ranks ${key} like the report`, () => {
      const [metric, cohort] = key.split("/") as [string, HotSpotCohort];
      const { ranked } = rankHotSpots(cohortNodes(parity.tree, cohort), metric);
      expect(ranked.slice(0, parity.top).map((r) => [r.node.path, r.value])).toEqual(expected);
    });
  }
});
