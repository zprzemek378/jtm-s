// What has been played in a universe.

import { API, type GameRecord } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Panel } from "@/components/ui/Panel";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniverseDetail.module.scss";

type GameHistoryListProps = {
  games: readonly GameRecord[];
  /** Whether this account may delete history, which is the owner's alone. */
  mayDelete: boolean;
  onChanged: () => void;
  onFailure: (message: string) => void;
};

/** The day and time a game was played, in the reader's own locale. */
function when(at: number, locale: string): string {
  return new Date(at).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GameHistoryList({ games, mayDelete, onChanged, onFailure }: GameHistoryListProps) {
  const { t, language } = useLanguage();
  const { request } = useBackend();

  if (games.length === 0) {
    return (
      <Panel title={t("universe.history")}>
        <p className={styles.hint}>{t("universe.historyEmpty")}</p>
      </Panel>
    );
  }

  return (
    <Panel title={t("universe.history")} meta={games.length}>
      <ul className={styles.rows}>
        {games.map((game) => (
          <li key={game.id} className={styles.row}>
            <span className={styles.rowName}>{when(game.startedAt, language)}</span>
            <span className={styles.rowMeta}>
              {t("universe.gameEvents", { count: game.upTo })}
              {game.closedAt === null ? ` · ${t("universe.gameUnfinished")}` : ""}
            </span>

            {mayDelete ? (
              <div className={styles.rowActions}>
                <Button
                  small
                  variant={ButtonVariant.Ghost}
                  onClick={() =>
                    void request(API.game(game.id), { method: "DELETE" })
                      .then(onChanged)
                      .catch((thrown: unknown) =>
                        onFailure(thrown instanceof Error ? thrown.message : String(thrown)),
                      )
                  }
                >
                  {t("universe.deleteGame")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
