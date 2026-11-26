// The people who play in a universe.
//
// Not the line-up of one evening: these belong to the universe, keep their
// number for ever and are only ever put aside, never deleted — every game that
// was ever played still names them.

import { useState } from "react";

import { API, type Universe, type UniversePlayer } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Checkbox } from "@/components/ui/Checkbox";
import { ColourSwatch } from "@/components/ui/ColourSwatch";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { PLAYER_COLOURS, nextFreeColour } from "@/constants/players";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniverseDetail.module.scss";

type PlayerListProps = {
  universe: Universe;
  players: readonly UniversePlayer[];
  onChanged: () => void;
  onFailure: (message: string) => void;
};

export function PlayerList({ universe, players, onChanged, onFailure }: PlayerListProps) {
  const { t } = useLanguage();
  const { request } = useBackend();
  const [draft, setDraft] = useState({ name: "", colour: PLAYER_COLOURS[0] ?? "#22c365" });
  const [busy, setBusy] = useState(false);

  const change = async (run: () => Promise<unknown>) => {
    setBusy(true);

    try {
      await run();
      onChanged();
    } catch (thrown) {
      onFailure(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  const update = (player: UniversePlayer, fields: Record<string, unknown>) =>
    change(() =>
      request(API.player(universe.id, player.number), { method: "PATCH", body: fields }),
    );

  return (
    <Panel title={t("universe.players")} meta={players.filter((player) => player.active).length}>
      <ul className={styles.rows}>
        {players.map((player) => (
          <li key={player.number} className={player.active ? styles.row : styles.rowAside}>
            <ColourSwatch
              colour={player.colour}
              label={t("setup.colourOf", { name: player.name })}
              onChange={(colour) => void update(player, { colour })}
            />

            <Input
              className={styles.rowInput}
              label={t("universe.playerName")}
              hideLabel
              defaultValue={player.name}
              disabled={busy}
              maxLength={40}
              // Saved when the field is left or the key is pressed, rather than
              // on every letter: this is one request per name, not per keystroke.
              onBlur={(event) => {
                const name = event.target.value.trim();

                if (name.length > 0 && name !== player.name) {
                  void update(player, { name });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />

            <span className={styles.rowNumber}>#{player.number}</span>

            <Checkbox
              label={t("universe.playerActive")}
              checked={player.active}
              disabled={busy}
              onChange={(active) => void update(player, { active })}
            />
          </li>
        ))}
      </ul>

      <div className={styles.addRow}>
        <ColourSwatch
          colour={draft.colour}
          label={t("universe.newPlayerColour")}
          onChange={(colour) => setDraft((held) => ({ ...held, colour }))}
        />
        <Input
          className={styles.rowInput}
          label={t("universe.newPlayer")}
          hideLabel
          placeholder={t("universe.newPlayer")}
          value={draft.name}
          maxLength={40}
          disabled={busy}
          onChange={(event) => setDraft((held) => ({ ...held, name: event.target.value }))}
        />
        <Button
          small
          variant={ButtonVariant.Secondary}
          disabled={busy || draft.name.trim().length === 0}
          onClick={() =>
            void change(async () => {
              await request(API.players(universe.id), {
                method: "POST",
                body: { name: draft.name.trim(), colour: draft.colour },
              });
              setDraft({
                name: "",
                // The next suggestion, so adding a table of people does not
                // mean choosing a colour each time.
                colour: nextFreeColour([...players.map((player) => player.colour), draft.colour]),
              });
            })
          }
        >
          {t("universe.add")}
        </Button>
      </div>

      <p className={styles.hint}>{t("universe.playersHint")}</p>
    </Panel>
  );
}
