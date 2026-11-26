// One universe: who is in it, who plays in it, and what has been played.

import { useCallback, useEffect, useState } from "react";

import { API, type Account, type UniverseDetail as UniverseDetailData } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Spinner } from "@/components/ui/Spinner";
import { useLanguage } from "@/i18n/useLanguage";

import { GameHistoryList } from "./GameHistoryList";
import { MemberList } from "./MemberList";
import { PlayerList } from "./PlayerList";
import { UniverseSettings } from "./UniverseSettings";
import styles from "./UniverseDetail.module.scss";

export function UniverseDetail({
  universeId,
  onDeleted,
}: {
  universeId: string;
  /** The universe is gone, so whatever was showing it has to look again. */
  onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const { account, request } = useBackend();
  const [detail, setDetail] = useState<UniverseDetailData | null>(null);
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [universe, everyone] = await Promise.all([
        request<UniverseDetailData>(API.universe(universeId)),
        // Members are picked from the people who have signed in, since there
        // are no invitations to accept. A refusal here is not a failure: it
        // only means this account may not see that list.
        request<{ accounts: readonly Account[] }>(API.accounts).catch(() => ({ accounts: [] })),
      ]);

      setDetail(universe);
      setAccounts(everyone.accounts);
      setFailure(null);
    } catch (thrown) {
      setFailure(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setLoading(false);
    }
  }, [request, universeId]);

  // Reading from the backend when the screen appears, or when another universe
  // is chosen: the outside system an effect is for.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  if (loading && !detail) {
    return <Spinner showLabel label={t("common.loading")} />;
  }

  if (!detail) {
    return (
      <p className={styles.failure} role="alert">
        {failure ?? t("universe.gone")}
      </p>
    );
  }

  return (
    <div className={styles.detail}>
      {failure ? (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      ) : null}

      <MemberList
        universe={detail.universe}
        members={detail.members}
        accounts={accounts}
        onChanged={() => void load()}
        onFailure={setFailure}
      />

      <PlayerList
        universe={detail.universe}
        players={detail.players}
        onChanged={() => void load()}
        onFailure={setFailure}
      />

      <GameHistoryList
        games={detail.games}
        mayDelete={detail.universe.ownerId === account?.id}
        onChanged={() => void load()}
        onFailure={setFailure}
      />

      {detail.universe.ownerId === account?.id ? (
        <UniverseSettings
          universe={detail.universe}
          games={detail.games.length}
          onChanged={() => void load()}
          onDeleted={onDeleted}
          onFailure={setFailure}
        />
      ) : null}
    </div>
  );
}
