// Reading an LRC file: the format Spotify does not provide and LRCLIB does.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { activeLineIndex, parseLrc } from "@/lyrics/lrc";

// A file as LRCLIB serves one: a metadata header, a two-digit fraction, a
// blank break line and a chorus stamped twice on one line.
const file = [
  "[ar:Queen]",
  "[ti:Bohemian Rhapsody]",
  "[00:00.15] Is this the real life?",
  "[00:07.1] Caught in a landslide",
  "[00:14] Open your eyes",
  "[00:20.153] ",
  "[01:00.00][02:00.00] Nothing really matters",
  "no timestamp at all",
  "[03:00.00] Let [00:10.00] stay in the line",
].join("\n");

describe("parseLrc", () => {
  const lines = parseLrc(file);

  test("keeps the stamped lines in order and drops the metadata", () => {
    assert.deepEqual(
      lines.map((line) => line.atMs),
      [150, 7100, 14000, 20153, 60000, 120000, 180000],
    );
  });

  test("scales fractions of a second however many digits they have", () => {
    assert.equal(lines[0].atMs, 150);
    assert.equal(lines[1].atMs, 7100);
    assert.equal(lines[2].atMs, 14000);
  });

  test("keeps a break line, which is how a file clears the screen", () => {
    assert.equal(lines[3].text, "");
  });

  test("repeats a line stamped twice", () => {
    assert.equal(lines.filter((line) => line.text === "Nothing really matters").length, 2);
  });

  test("treats a stamp further into a line as lyric, not timing", () => {
    assert.equal(lines[6].text, "Let [00:10.00] stay in the line");
  });

  test("finds nothing to sing in a file with no stamps at all", () => {
    assert.deepEqual(parseLrc("Just words\nAnd more words"), []);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc(file);

  test("has no current line before the first one is sung", () => {
    assert.equal(activeLineIndex(lines, 0), -1);
    assert.equal(activeLineIndex(lines, 149), -1);
  });

  test("moves on at each stamp", () => {
    assert.equal(activeLineIndex(lines, 150), 0);
    assert.equal(activeLineIndex(lines, 7099), 0);
    assert.equal(activeLineIndex(lines, 7100), 1);
    assert.equal(activeLineIndex(lines, 20153), 3);
    assert.equal(activeLineIndex(lines, 119999), 4);
  });

  test("holds the last line to the end of the track", () => {
    assert.equal(activeLineIndex(lines, 180001), 6);
    assert.equal(activeLineIndex(lines, 9_999_999), 6);
  });

  test("answers for an empty file", () => {
    assert.equal(activeLineIndex([], 1000), -1);
  });
});
