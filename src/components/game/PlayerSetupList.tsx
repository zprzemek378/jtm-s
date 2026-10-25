import { useState, type CSSProperties } from "react";

import { MAX_PLAYERS } from "@/constants/gameRules";
import type { PlayerDraft } from "@/game/types";
import { keyCodeLabel } from "@/helpers/keys";
import {
  canAddPlayer,
  canRemovePlayer,
  findKeyOwner,
  isAssignableKeyCode,
} from "@/helpers/playerSetup";
import { useKeyCapture } from "@/hooks/useKeyCapture";
import { DropEdge, useListReorder } from "@/hooks/useListReorder";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { ColourSwatch } from "../ui/ColourSwatch";
import { Input } from "../ui/Input";
import { Keycap } from "../ui/Keycap";
import styles from "./PlayerSetupList.module.scss";

type PlayerSetupListProps = {
  players: readonly PlayerDraft[];
  onRename: (id: string, name: string) => void;
  onAssignKey: (id: string, keyCode: string) => void;
  onSetColour: (id: string, colour: string) => void;
  /** Reorders the line-up — which is where everyone is sitting. */
  onMove: (from: number, to: number) => void;
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
  onSetColour,
  onMove,
  onAdd,
  onRemove,
  defaultName,
}: PlayerSetupListProps) {
  const { t } = useLanguage();
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);
  const reorder = useListReorder(onMove);

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
    <div className={styles.list} {...reorder.listProps}>
      {players.map((player, index) => {
        const isCapturing = capturingId === player.id;
        const name = player.name.trim() || defaultName(index);

        const edge = reorder.dropEdge(index);
        const rowClasses = [
          styles.row,
          reorder.draggingIndex === index ? styles.lifted : null,
          edge === DropEdge.Above ? styles.dropAbove : null,
          edge === DropEdge.Below ? styles.dropBelow : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={player.id}
            className={rowClasses}
            style={{ "--player-colour": player.colour } as CSSProperties}
            {...reorder.rowProps(index)}
          >
            <button
              type="button"
              className={styles.grip}
              title={t("setup.reorder", { name })}
              aria-label={t("setup.reorder", { name })}
              // Dragging is the quick way; the arrows are the one that works
              // without a pointer, and keep the focus on the moving row.
              onKeyDown={(event) => {
                const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;

                if (step === 0) {
                  return;
                }

                event.preventDefault();
                onMove(index, index + step);
              }}
              {...reorder.handleProps(index)}
            >
              <span aria-hidden="true">⠿</span>
            </button>

            <span className={styles.index} aria-hidden="true">
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

            <ColourSwatch
              colour={player.colour}
              label={t("setup.colourOf", { name })}
              onChange={(colour) => onSetColour(player.id, colour)}
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

      <div className={styles.add}>
        <Button variant={ButtonVariant.Secondary} disabled={!canAddPlayer(players)} onClick={onAdd}>
          {t("setup.addPlayer")}
        </Button>
        {/* The ceiling is high enough that saying it up front would only be
            noise; it is worth a word at the one moment it matters. */}
        {canAddPlayer(players) ? null : (
          <p className={styles.hint}>{t("setup.playersFull", { max: MAX_PLAYERS })}</p>
        )}
      </div>
    </div>
  );
}
