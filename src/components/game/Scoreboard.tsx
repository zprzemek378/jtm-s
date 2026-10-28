import type { CSSProperties } from "react";

import { formatMoney } from "@/game/rewards";
import type { GamePlayer, PlayerId } from "@/game/types";
import { balanceOf, type Accounts } from "@/helpers/money";
import { useLanguage } from "@/i18n/useLanguage";

import { Keycap } from "../ui/Keycap";
import { ExtraTimeBadge } from "./ExtraTimeBadge";
import { TitlesBadge } from "./TitlesBadge";
import styles from "./Scoreboard.module.scss";

type ScoreboardProps = {
  players: readonly GamePlayer[];
  accounts: Accounts;
  targetMoney: number;
  /** Players sitting out this round; their key does nothing and they are dimmed. */
  suspended: readonly PlayerId[];
  /** Players who will sit out the next round. */
  pendingSuspended: readonly PlayerId[];
  /** The player who buzzed in, highlighted while they answer. */
  buzzedPlayerId: PlayerId | null;
  /** Players who still hold each lifeline; empty when the game has none. */
  extraTimeLeft: readonly PlayerId[];
  titlesLeft: readonly PlayerId[];
  /** Spend the buzzed player's lifelines, when this is the moment for them. */
  onUseExtraTime?: () => void;
  onUseTitles?: () => void;
  /** Marks the winner once the game is over. */
  winnerId?: PlayerId | null;
};

/** Who is playing, what they have scored, and whose key is live right now. */
export function Scoreboard({
  players,
  accounts,
  targetMoney,
  suspended,
  pendingSuspended,
  buzzedPlayerId,
  extraTimeLeft,
  titlesLeft,
  onUseExtraTime,
  onUseTitles,
  winnerId = null,
}: ScoreboardProps) {
  const { t } = useLanguage();

  return (
    <ul className={styles.board}>
      {players.map((player) => {
        const isSuspended = suspended.includes(player.id);
        const isPending = pendingSuspended.includes(player.id);
        // Dimmed the moment a ban is earned, not once the next round starts.
        // The badge appears then too, and a card that still reads as fully in
        // the game while announcing it is out of the next one is a mixed
        // message at the exact moment the table is reading the standings.
        const isOut = isSuspended || isPending;
        const classNames = [
          styles.card,
          isOut ? styles.suspended : null,
          player.id === buzzedPlayerId ? styles.buzzed : null,
          player.id === winnerId ? styles.winner : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <li
            key={player.id}
            className={classNames}
            style={{ "--player-colour": player.colour } as CSSProperties}
          >
            <div className={styles.head}>
              <span className={styles.name}>{player.name}</span>
              <Keycap keyCode={player.keyCode} emptyLabel="—" muted={isOut} />
            </div>

            <div className={styles.score}>
              <strong className={styles.scoreValue}>
                {formatMoney(balanceOf(accounts, player.id))}
              </strong>
              <span className={styles.scoreTotal}>
                {t("common.of")} {formatMoney(targetMoney)}
              </span>
            </div>

            {isSuspended ? (
              <span className={styles.badge}>{t("game.suspendedNow")}</span>
            ) : isPending ? (
              <span className={styles.badge}>{t("game.suspendedNext")}</span>
            ) : null}

            {/* A row of its own along the bottom, where the lifelines a player
                still holds line up. Only the player who pressed, and only
                while the round waits on them, can actually spend one. */}
            {extraTimeLeft.includes(player.id) || titlesLeft.includes(player.id) ? (
              <div className={styles.lifelines}>
                {extraTimeLeft.includes(player.id) ? (
                  <ExtraTimeBadge
                    name={player.name}
                    onUse={
                      onUseExtraTime && player.id === buzzedPlayerId ? onUseExtraTime : undefined
                    }
                  />
                ) : null}
                {titlesLeft.includes(player.id) ? (
                  <TitlesBadge
                    name={player.name}
                    onUse={onUseTitles && player.id === buzzedPlayerId ? onUseTitles : undefined}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
