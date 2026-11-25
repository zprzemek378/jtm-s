// Pooling several playlists into the one a game draws from.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { unionTracks } from "@/helpers/trackUnion";
import { emptySkipCounts } from "@/spotify/types";

const track = (id: string) => ({
  id,
  uri: `spotify:track:${id}`,
  name: id,
  artists: "Someone",
  durationMs: 200_000,
  albumName: "Album",
  albumImageUrl: null,
});

const source = (playlistId: string, playlistName: string, ids: string[]) => ({
  playlistId,
  playlistName,
  tracks: { tracks: ids.map(track), skipped: emptySkipCounts() },
});

describe("unionTracks", () => {
  const union = unionTracks([
    source("p1", "Impreza", ["a", "b"]),
    source("p2", "Chillout", ["b"]),
    // Two playlists may share a name, which is exactly why ids are kept.
    source("p3", "Impreza", ["b"]),
  ]);
  const b = union.tracks.find((entry) => entry.id === "b");

  test("pools a recording once however many playlists hold it", () => {
    assert.equal(union.tracks.length, 2);
    assert.equal(union.duplicateCount, 2);
  });

  test("remembers every playlist it came from, by id", () => {
    assert.deepEqual([...b!.playlistIds], ["p1", "p2", "p3"]);
  });

  test("and by name, including two that share one", () => {
    assert.deepEqual([...b!.playlistNames], ["Impreza", "Chillout", "Impreza"]);
  });

  test("leaves a track from a single playlist with a single source", () => {
    const a = union.tracks.find((entry) => entry.id === "a");
    assert.deepEqual([...a!.playlistIds], ["p1"]);
  });
});
