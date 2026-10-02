import { formatMoney } from "@/game/rewards";
import type { GamePlayer, PlayerId } from "@/game/types";
import { balanceOf, rankPlayers, type Accounts } from "@/helpers/money";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonGroup } from "../ui/ButtonGroup";
import { ButtonVariant } from "../ui/buttonVariant";
import styles from "./GameOverPanel.module.scss";

type GameOverPanelProps = {
  players: readonly GamePlayer[];
  accounts: Accounts;
  winnerId: PlayerId | null;
  onPlayAgain: () => void;
  onChangeSettings: () => void;
};

/** The end of a game: who won, the final table, and where to go next. */
export function GameOverPanel({
  players,
  accounts,
  winnerId,
  onPlayAgain,
  onChangeSettings,
}: GameOverPanelProps) {
  const { t } = useLanguage();
  const winner = players.find((player) => player.id === winnerId) ?? null;
  const ranked = rankPlayers(players, accounts);

  return (
    <div className={styles.panel}>
      <p className={styles.eyebrow}>{t("game.finished")}</p>
      <h2 className={styles.headline}>{t("game.winner", { name: winner?.name ?? "" })}</h2>

      <div className={styles.results}>
        <span className={styles.resultsLabel}>{t("game.finalScores")}</span>
        <ol className={styles.list}>
          {ranked.map((player, index) => (
            <li key={player.id} className={styles.row}>
              <span className={styles.place}>{index + 1}.</span>
              <span className={styles.name}>{player.name}</span>
              <span className={styles.score}>{formatMoney(balanceOf(accounts, player.id))}</span>
            </li>
          ))}
        </ol>
      </div>

      <ButtonGroup>
        <Button large variant={ButtonVariant.Primary} onClick={onPlayAgain}>
          {t("game.playAgain")}
        </Button>
        <Button large variant={ButtonVariant.Secondary} onClick={onChangeSettings}>
          {t("game.changeSettings")}
        </Button>
      </ButtonGroup>
    </div>
  );
}
