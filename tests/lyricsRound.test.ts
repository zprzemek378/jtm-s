// A round played on the words alone: which files can carry one, where it
// opens, and how much of it is on screen as the clock runs.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { lyricLinesFor, openingLine, visibleLineCount } from "@/game/lyricsRound";
import { LyricsKind, LyricsStatus, type LyricsReadout } from "@/lyrics/types";

const ready = (lyrics: LyricsReadout["lyrics"]): LyricsReadout => ({
  status: LyricsStatus.Ready,
  lyrics,
});
const synced = (texts: string[]) =>
  ready({ kind: LyricsKind.Synced, lines: texts.map((text, i) => ({ atMs: i * 1000, text })) });

const words = ["one", "two", "three", "four", "five", "six", "seven"];

describe("visibleLineCount", () => {
  test("shows a line from the off and another every few seconds", () => {
    assert.equal(visibleLineCount(0), 1);
    assert.equal(visibleLineCount(2999), 1);
    assert.equal(visibleLineCount(3000), 2);
    assert.equal(visibleLineCount(9000), 4);
  });

  test("shows the first line for a clock that has not started", () => {
    assert.equal(visibleLineCount(-500), 1);
  });
});

describe("lyricLinesFor", () => {
  test("takes a timed file with enough to say", () => {
    assert.deepEqual(lyricLinesFor(synced(words)), words);
  });

  test("drops the blank lines, which are a file's instrumental breaks", () => {
    const withGaps = ["one", "", "two", "  ", "three", "four", "five", "six", "seven"];

    assert.deepEqual(lyricLinesFor(synced(withGaps)), words);
  });

  test("refuses a file too short to last a round", () => {
    assert.equal(lyricLinesFor(synced(words.slice(0, 5))), null);
  });

  test("takes an untimed file too — it cannot be sung along to, but it can be read", () => {
    assert.deepEqual(
      lyricLinesFor(ready({ kind: LyricsKind.Plain, text: words.join("\n") })),
      words,
    );
  });

  test("refuses a short untimed file just the same", () => {
    assert.equal(lyricLinesFor(ready({ kind: LyricsKind.Plain, text: "one\n\ntwo\n" })), null);
  });

  test("refuses a lookup that has not answered, or answered with nothing", () => {
    for (const status of [LyricsStatus.Loading, LyricsStatus.Missing, LyricsStatus.Failed]) {
      assert.equal(lyricLinesFor({ status, lyrics: null }), null, status);
    }
  });
});

describe("openingLine", () => {
  test("has only one place to start when there is nothing to spare", () => {
    assert.equal(
      openingLine(6, () => 0.99),
      0,
    );
    assert.equal(
      openingLine(8, () => 0.99),
      0,
    );
  });

  test("opens anywhere that still runs to the end", () => {
    assert.equal(
      openingLine(20, () => 0),
      0,
    );
    assert.equal(
      openingLine(20, () => 0.999),
      12,
    );
  });

  test("never opens so late that the round runs out of words", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const at = openingLine(40, () => roll);

      assert.ok(at >= 0 && at <= 32, `opened at ${at}, which leaves too little behind`);
    }
  });
});
