// The games this account played outside any universe.
//
// Free play is what the app starts in and what it falls back to, so those
// evenings are worth reading back as well. They belong to the account that
// hosted them and to nobody else, which is also who may delete them.

import { useCallback, useEffect, useState } from "react";

import { API, type GameRecord } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Panel } from "@/components/ui/Panel";
import { useLanguage } from "@/i18n/useLanguage";

import { GameHistoryList } from "./GameHistoryList";
import styles from "./UniverseDetail.module.scss";

export function FreePlayHistory() {
  const { t } = useLanguage();
  const { request } = useBackend();
  const [games, setGames] = useState<readonly GameRecord[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const answer = await request<{ games: readonly GameRecord[] }>(API.games);

      setGames(answer.games);
      setFailure(null);
    } catch (thrown) {
      setFailure(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }, [request]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  if (games.length === 0) {
    return failure === null ? null : (
      <Panel title={t("universe.freeGames")}>
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      </Panel>
    );
  }

  return (
    <GameHistoryList
      title={t("universe.freeGames")}
      games={games}
      mayDelete
      onChanged={() => void load()}
      onFailure={setFailure}
    />
  );
}
