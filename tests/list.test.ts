// Moving a row to another place in a list — what dragging a player comes down to.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { landingIndex, moveItem } from "@/helpers/list";

const list = ["A", "B", "C", "D"];
const SLOT = "·";

/**
 * What a drop should produce, derived a different way: a placeholder goes into
 * the gap, the dragged item is taken out, and the placeholder becomes it. No
 * arithmetic, so it cannot repeat a mistake the code under test is making.
 */
function expected(from: number, gap: number): string[] {
  const moved = list[from];
  const withSlot = [...list.slice(0, gap), SLOT, ...list.slice(gap)];

  return withSlot.filter((item) => item !== moved).map((item) => (item === SLOT ? moved : item));
}

describe("moveItem", () => {
  test("moves forwards and backwards", () => {
    assert.deepEqual(moveItem(list, 0, 2), ["B", "C", "A", "D"]);
    assert.deepEqual(moveItem(list, 3, 0), ["D", "A", "B", "C"]);
  });

  test("refuses a move to nowhere, which the arrow keys ask for at the ends", () => {
    assert.deepEqual(moveItem(list, 1, 1), list);
    assert.deepEqual(moveItem(list, 0, -1), list);
    assert.deepEqual(moveItem(list, 3, 4), list);
  });

  test("leaves the original alone", () => {
    moveItem(list, 0, 3);
    assert.deepEqual(list, ["A", "B", "C", "D"]);
  });
});

describe("landingIndex", () => {
  test("lands every gap where an independent model says it should", () => {
    for (let from = 0; from < list.length; from += 1) {
      for (let gap = 0; gap <= list.length; gap += 1) {
        assert.deepEqual(
          moveItem(list, from, landingIndex(from, gap)),
          expected(from, gap),
          `moving ${list[from]} into gap ${gap}`,
        );
      }
    }
  });

  test("sends a row dragged clear of the list to the top or the bottom", () => {
    assert.deepEqual(moveItem(list, 2, landingIndex(2, 0)), ["C", "A", "B", "D"]);
    assert.deepEqual(moveItem(list, 1, landingIndex(1, list.length)), ["A", "C", "D", "B"]);
  });

  test("changes nothing for the gaps either side of where the row already is", () => {
    assert.deepEqual(moveItem(list, 1, landingIndex(1, 1)), list);
    assert.deepEqual(moveItem(list, 1, landingIndex(1, 2)), list);
  });
});
