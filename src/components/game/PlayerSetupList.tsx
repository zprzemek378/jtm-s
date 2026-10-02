import { useState, type CSSProperties } from "react";

import { MAX_PLAYERS, MIN_PLAYERS } from "@/constants/gameRules";
import { playerHue } from "@/constants/players";
import type { PlayerDraft } from "@/game/types";
import { keyCodeLabel } from "@/helpers/keys";
import {
  canAddPlayer,
  canRemovePlayer,
  findKeyOwner,
  isAssignableKeyCode,
} from "@/helpers/playerSetup";
import { useKeyCapture } from "@/hooks/useKeyCapture";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Input } from "../ui/Input";
import { Keycap } from "../ui/Keycap";
import styles from "./PlayerSetupList.module.scss";

type PlayerSetupListProps = {
  players: readonly PlayerDraft[];
  onRename: (id: string, name: string) => void;
  onAssignKey: (id: string, keyCode: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** Falls back to "Player N" when a name is left empty. */
  defaultName: (index: number) => string;
};

/** The line-up: one row per player, each with a name and a buzzer key. */
export function PlayerSetupList({
  players,
  onRename,
  onAssignKey,
  onAdd,
  onRemove,
  defaultName,
}: PlayerSetupListProps) {
  const { t } = useLanguage();
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);

  const stopCapturing = () => {
    setCapturingId(null);
  };

  useKeyCapture(
    capturingId !== null,
    (keyCode) => {
      const targetId = capturingId;

      if (targetId === null) {
        return;
      }

      if (!isAssignableKeyCode(keyCode)) {
        setKeyProblem(t("setup.keyReserved", { key: keyCodeLabel(keyCode) }));

        return;
      }

      const owner = findKeyOwner(players, keyCode, targetId);

      if (owner) {
        const ownerIndex = players.indexOf(owner);

        setKeyProblem(
          t("setup.keyTaken", {
            key: keyCodeLabel(keyCode),
            name: owner.name.trim() || defaultName(ownerIndex),
          }),
        );

        return;
      }

      setKeyProblem(null);
      onAssignKey(targetId, keyCode);
      setCapturingId(null);
    },
    () => {
      setKeyProblem(null);
      stopCapturing();
    },
  );

  return (
    <div className={styles.list}>
      <p className={styles.hint}>
        {t("setup.playersHint", { min: MIN_PLAYERS, max: MAX_PLAYERS })}
      </p>

      {players.map((player, index) => {
        const isCapturing = capturingId === player.id;
        const name = player.name.trim() || defaultName(index);

        return (
          <div key={player.id} className={styles.row}>
            <span
              className={styles.avatar}
              style={{ "--player-hue": playerHue(index) } as CSSProperties}
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <Input
              className={styles.name}
              label={t("setup.nameLabel", { number: index + 1 })}
              hideLabel
              value={player.name}
              maxLength={24}
              placeholder={t("setup.playerNamePlaceholder", {
                number: index + 1,
              })}
              onChange={(event) => onRename(player.id, event.target.value)}
            />

            <div className={styles.keyCell}>
              <Keycap keyCode={player.keyCode} emptyLabel={t("setup.noKey")} />
              <Button
                small
                variant={isCapturing ? ButtonVariant.Primary : ButtonVariant.Secondary}
                onClick={() => {
                  setKeyProblem(null);
                  setCapturingId(isCapturing ? null : player.id);
                }}
              >
                {isCapturing
                  ? t("setup.pressKey")
                  : player.keyCode === null
                    ? t("setup.assignKey")
                    : t("setup.changeKey")}
              </Button>
            </div>

            <Button
              small
              iconOnly
              variant={ButtonVariant.Ghost}
              disabled={!canRemovePlayer(players)}
              onClick={() => onRemove(player.id)}
              title={t("setup.removePlayer", { name })}
              aria-label={t("setup.removePlayer", { name })}
            >
              <span aria-hidden="true">✕</span>
            </Button>
          </div>
        );
      })}

      {capturingId !== null ? <p className={styles.capturing}>{t("setup.pressKeyHint")}</p> : null}
      {keyProblem ? (
        <p className={styles.problem} role="alert">
          {keyProblem}
        </p>
      ) : null}

      <div>
        <Button variant={ButtonVariant.Secondary} disabled={!canAddPlayer(players)} onClick={onAdd}>
          {t("setup.addPlayer")}
        </Button>
      </div>
    </div>
  );
}
