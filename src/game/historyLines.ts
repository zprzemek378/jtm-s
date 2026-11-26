// A game's history, in words.
//
// One line per thing that happened, named rather than written out, so the
// history reads in both languages and can be checked without a screen. The
// money comes from the state the step produced rather than from the action:
// what an answer was worth is a rule, and the rules already worked it out.

import type { TranslationKey } from "@/i18n/translations";

import type { LoggedAction } from "./eventLog";
import type { GameState } from "./gameState";
import { formatMoney } from "./rewards";
import { Verdict, type PlayerId } from "./types";

export type HistoryLine = {
  key: TranslationKey;
  params?: Record<string, string | number>;
};

const VERDICT_LINES: Record<Verdict, TranslationKey> = {
  [Verdict.Correct]: "history.correct",
  [Verdict.Half]: "history.half",
  [Verdict.Close]: "history.close",
  [Verdict.Incorrect]: "history.incorrect",
};

/** The line for one step: the action, as the state before and after explain it. */
export function describeStep(
  action: LoggedAction,
  before: GameState,
  after: GameState,
): HistoryLine {
  const nameOf = (playerId: PlayerId | null): string =>
    after.players.find((player) => player.id === playerId)?.name ??
    before.players.find((player) => player.id === playerId)?.name ??
    "?";

  switch (action.type) {
    case "start-round":
      return {
        key: after.lyricsOnly ? "history.roundLyrics" : "history.round",
        params: { number: after.round, track: after.track?.name ?? action.trackId },
      };

    case "buzz":
      return {
        key: "history.buzz",
        params: { name: nameOf(action.playerId), amount: formatMoney(action.amount) },
      };

    case "tie":
      return {
        key: "history.tie",
        params: { names: action.playerIds.map(nameOf).join(", ") },
      };

    case "guess-window-elapsed":
      return { key: "history.timeout" };

    case "use-extra-time":
      return { key: "history.extraTime", params: { name: nameOf(before.buzzedPlayerId) } };

    case "extra-time-elapsed":
      return { key: "history.extraTimeOver" };

    case "use-titles":
      return {
        key: "history.titles",
        params: { name: nameOf(before.buzzedPlayerId), count: action.trackIds.length },
      };

    case "reveal":
      return { key: "history.reveal" };

    case "judge": {
      const verdict = after.lastVerdict;

      return {
        key: VERDICT_LINES[action.verdict],
        params: {
          name: nameOf(verdict?.playerId ?? before.buzzedPlayerId),
          amount: formatMoney(verdict?.amount ?? 0),
        },
      };
    }

    case "abandon-round":
      return { key: "history.abandoned" };

    case "apply-edit":
      return { key: "history.edit" };

    case "reset":
      return { key: "history.rematch" };

    default:
      // An event written down by a newer version of the game than the one
      // reading it. Saying so is better than leaving a gap in the history.
      return { key: "history.unknown" };
  }
}
