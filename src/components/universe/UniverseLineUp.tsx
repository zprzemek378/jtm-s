// Tonight's table, chosen from the people of a universe.
//
// Who plays and what colour they are belong to the universe; which key they
// press belongs to this keyboard, so that is the one thing picked here. A
// player keeps their number for ever, which is also their identity in the
// event log — so the same person is the same person across every evening,
// however they were sitting.

import { useCallback, useEffect, useState } from "react";

import { API, type UniverseDetail as UniverseDetailData, type UniversePlayer } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Checkbox } from "@/components/ui/Checkbox";
import { ColourSwatch } from "@/components/ui/ColourSwatch";
import { Keycap } from "@/components/ui/Keycap";
import { Spinner } from "@/components/ui/Spinner";
import type { PlayerDraft } from "@/game/types";
import { universePlayerId } from "@/game/universePlayers";
import { keyCodeLabel } from "@/helpers/keys";
import { findKeyOwner, isAssignableKeyCode } from "@/helpers/playerSetup";
import { useKeyCapture } from "@/hooks/useKeyCapture";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniverseLineUp.module.scss";

type UniverseLineUpProps = {
  universeId: string;
  /** Who is at the table, with the keys this keyboard gave them. */
  value: readonly PlayerDraft[];
  onChange: (players: readonly PlayerDraft[]) => void;
};

export function UniverseLineUp({ universeId, value, onChange }: UniverseLineUpProps) {
  const { t } = useLanguage();
  const { request } = useBackend();
  const [players, setPlayers] = useState<readonly UniversePlayer[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await request<UniverseDetailData>(API.universe(universeId));

      setPlayers(detail.players.filter((player) => player.active));
      setFailure(null);
    } catch (thrown) {
      setFailure(thrown instanceof Error ? thrown.message : String(thrown));
      setPlayers([]);
    }
  }, [request, universeId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  const toggle = (player: UniversePlayer, playing: boolean) => {
    const id = universePlayerId(player);

    onChange(
      playing
        ? [...value, { id, name: player.name, keyCode: null, colour: player.colour }]
        : value.filter((draft) => draft.id !== id),
    );
  };

  useKeyCapture(
    capturingId !== null,
    useCallback(
      (keyCode: string) => {
        if (capturingId === null) {
          return;
        }

        if (!isAssignableKeyCode(keyCode)) {
          setKeyProblem(t("setup.keyReserved", { key: keyCodeLabel(keyCode) }));

          return;
        }

        const owner = findKeyOwner([...value], keyCode, capturingId);

        if (owner) {
          setKeyProblem(t("setup.keyTaken", { key: keyCodeLabel(keyCode), name: owner.name }));

          return;
        }

        onChange(value.map((draft) => (draft.id === capturingId ? { ...draft, keyCode } : draft)));
        setKeyProblem(null);
        setCapturingId(null);
      },
      [capturingId, onChange, t, value],
    ),
    useCallback(() => setCapturingId(null), []),
  );

  if (players === null) {
    return <Spinner showLabel label={t("common.loading")} />;
  }

  if (players.length === 0) {
    return <p className={styles.hint}>{failure ?? t("universe.noPlayersYet")}</p>;
  }

  return (
    <div>
      <ul className={styles.list}>
        {players.map((player) => {
          const draft = value.find((candidate) => candidate.id === universePlayerId(player));

          return (
            <li key={player.number} className={styles.row}>
              <Checkbox
                label={player.name}
                checked={draft !== undefined}
                onChange={(playing) => toggle(player, playing)}
              />

              <ColourSwatch
                className={styles.colour}
                colour={player.colour}
                label={t("setup.colourOf", { name: player.name })}
                // The colour belongs to the universe: it is changed on the
                // universe screen, so that one person is one colour every
                // evening. Shown here only so the table can be recognised.
                onChange={() => undefined}
              />

              {draft ? (
                <div className={styles.keyCell}>
                  <Keycap keyCode={draft.keyCode} emptyLabel={t("setup.noKey")} />
                  <Button
                    small
                    variant={
                      capturingId === draft.id ? ButtonVariant.Primary : ButtonVariant.Secondary
                    }
                    onClick={() => {
                      setKeyProblem(null);
                      setCapturingId(capturingId === draft.id ? null : draft.id);
                    }}
                  >
                    {capturingId === draft.id ? t("setup.pressKey") : t("setup.changeKey")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {keyProblem ? <p className={styles.problem}>{keyProblem}</p> : null}
      <p className={styles.hint}>{t("universe.lineUpHint")}</p>
    </div>
  );
}
