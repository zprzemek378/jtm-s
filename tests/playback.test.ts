// The two commands with a race in them: pausing the moment somebody buzzes,
// and knowing when the music has actually started.
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { pause, seek, waitUntilPlaying } from "@/spotify/playback/viaSdk";

import { fakePlayer, state, type Scripted } from "./support/player";

// The module sleeps through `window`, which a test run has no reason to have.
Object.assign(globalThis, { window: globalThis });

describe("pausing because somebody buzzed", () => {
  test("asks once when the device reports itself stopped", async () => {
    const fake = fakePlayer([state(true)]);

    await pause(fake.player);

    assert.deepEqual(fake.commands, ["pause"]);
  });

  test("asks again while the music is still running", async () => {
    const fake = fakePlayer([state(false), state(false), state(true)]);

    await pause(fake.player);

    assert.deepEqual(fake.commands, ["pause", "pause", "pause"]);
  });

  test("keeps watching a device that reports nothing yet — the race it exists for", async () => {
    // A track on its way answers with no state at all. Pausing then is pausing
    // thin air: the sound arrives afterwards, with nobody left to stop it.
    const fake = fakePlayer([null, null, state(false), state(true)]);

    await pause(fake.player);

    assert.deepEqual(fake.commands, ["pause", "pause"], "nothing to re-pause until it answers");
    assert.ok(fake.reads >= 3, "it stopped watching while the device was still silent");
  });

  test("gives up rather than retrying for ever", async () => {
    const fake = fakePlayer([state(false)]);

    await pause(fake.player);

    assert.equal(fake.commands.length, 4);
  });

  test("stops once the music is wanted again", async () => {
    const fake = fakePlayer([state(false)]);

    await pause(fake.player, () => false);

    assert.deepEqual(fake.commands, ["pause"]);
    assert.equal(fake.reads, 0, "it must not even look once the round has moved on");
  });

  test("does nothing in particular before there is a player", async () => {
    await pause(null);
  });
});

describe("waiting for the music to start", () => {
  const asked = "spotify:track:t1";

  test("says so once the device is playing what was asked for", async () => {
    const fake = fakePlayer([null, state(true, asked), state(false, asked)]);

    assert.equal(await waitUntilPlaying(fake.player, asked), true);
  });

  test("accepts the track Spotify swapped in for this market", async () => {
    const fake = fakePlayer([state(false, "spotify:track:other", asked)]);

    assert.equal(await waitUntilPlaying(fake.player, asked), true);
  });

  test("a stopped device is not playing, however long it says so", async () => {
    const script: Scripted[] = Array.from({ length: 4 }, () => state(true, asked));
    const fake = fakePlayer([...script, state(false, asked)]);

    assert.equal(await waitUntilPlaying(fake.player, asked), true);
    assert.ok(fake.reads >= 5, "it settled for a paused device");
  });

  test("gives up on a device that never starts, without failing the round", async () => {
    const fake = fakePlayer([null]);

    assert.equal(await waitUntilPlaying(fake.player, asked), false);
  });
});

describe("seeking", () => {
  test("sends whole milliseconds inside the track", async () => {
    const fake = fakePlayer();

    await seek(fake.player, -40.6);
    await seek(fake.player, 1200.4);

    assert.deepEqual(fake.commands, ["seek 0", "seek 1200"]);
  });

  test("a drag sends one command, for where the scrubber was let go", async () => {
    const fake = fakePlayer();

    await Promise.all([seek(fake.player, 1000), seek(fake.player, 2000), seek(fake.player, 3000)]);

    assert.deepEqual(fake.commands, ["seek 3000"]);
  });
});
