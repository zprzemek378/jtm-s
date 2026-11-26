// A player that answers the way a device does.
//
// The real one is a script served by Spotify that talks to a device we cannot
// see; what the game depends on is its answers, so this records the commands
// and reads its state out of a script written by the suite.

/** What `getCurrentState` is to answer, one call after another. */
export type Scripted = Spotify.PlaybackState | null;

export type FakePlayer = {
  player: Spotify.Player;
  /** Commands sent, in order: "pause", "resume", "seek 1200"… */
  commands: string[];
  /** How many times the state has been asked for. */
  reads: number;
};

export function state(
  paused: boolean,
  uri = "spotify:track:t1",
  linkedFrom?: string,
): Spotify.PlaybackState {
  return {
    paused,
    position: 0,
    duration: 200_000,
    track_window: {
      current_track: {
        uri,
        ...(linkedFrom === undefined ? {} : { linked_from: { uri: linkedFrom } }),
      },
    },
  } as unknown as Spotify.PlaybackState;
}

/**
 * @param script What each read of the state answers; the last answer repeats
 *   for ever, so a steady device is one entry long.
 */
export function fakePlayer(script: readonly Scripted[] = [state(true)]): FakePlayer {
  const fake: FakePlayer = { player: null as unknown as Spotify.Player, commands: [], reads: 0 };

  const send = (command: string) => {
    fake.commands.push(command);

    return Promise.resolve();
  };

  fake.player = {
    pause: () => send("pause"),
    resume: () => send("resume"),
    seek: (positionMs: number) => send(`seek ${positionMs}`),
    setVolume: (volume: number) => send(`volume ${volume}`),
    getCurrentState: () => {
      const answer = script[Math.min(fake.reads, script.length - 1)] ?? null;
      fake.reads += 1;

      return Promise.resolve(answer);
    },
  } as unknown as Spotify.Player;

  return fake;
}
