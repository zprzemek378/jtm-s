import { useState, type CSSProperties } from "react";

import { formatMoney } from "@/game/rewards";
import type { GamePlayer, PlayerId } from "@/game/types";
import { keyCodeLabel } from "@/helpers/keys";
import { moveItem } from "@/helpers/list";
import { balanceOf, type Accounts } from "@/helpers/money";
import { findKeyOwner, isAssignableKeyCode } from "@/helpers/playerSetup";
import { useKeyCapture } from "@/hooks/useKeyCapture";
import { DropEdge, useListReorder } from "@/hooks/useListReorder";
import { useLanguage } from "@/i18n/useLanguage";

import { Modal } from "../advanced/Modal";
import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Checkbox } from "../ui/Checkbox";
import { ColourSwatch } from "../ui/ColourSwatch";
import { Input } from "../ui/Input";
import { Keycap } from "../ui/Keycap";
import styles from "./EditModeDialog.module.scss";

type EditModeDialogProps = {
  players: readonly GamePlayer[];
  accounts: Accounts;
  /** Who is already booked to sit out the next round. */
  suspendedNext: readonly PlayerId[];
  targetMoney: number;
  onApply: (
    accounts: Accounts,
    suspendedNext: readonly PlayerId[],
    players: readonly GamePlayer[],
  ) => void;
  onCancel: () => void;
};

/** Whatever was typed, reduced to a sum a game can hold. */
function toBalance(text: string): number {
  const parsed = Number.parseInt(text, 10);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * The hidden edit screen: rewrites balances, bans and the line-up by hand.
 *
 * The line-up is here for the same reason it is on the setup screen — the
 * cards are laid out in the order the players sit — except that mid-game the
 * alternative was abandoning the game and typing everyone in again.
 */
export function EditModeDialog({
  players,
  accounts,
  suspendedNext,
  targetMoney,
  onApply,
  onCancel,
}: EditModeDialogProps) {
  const { t } = useLanguage();

  // Held as text while it is being typed, so a half-typed number does not get
  // rewritten under the cursor.
  const [drafts, setDrafts] = useState<Record<PlayerId, string>>(() =>
    Object.fromEntries(
      players.map((player) => [player.id, String(balanceOf(accounts, player.id))]),
    ),
  );
  const [banned, setBanned] = useState<readonly PlayerId[]>(suspendedNext);
  /** The line-up as it is being edited; nothing reaches the game until Apply. */
  const [lineUp, setLineUp] = useState<readonly GamePlayer[]>(players);

  /** Whose buzzer is being reassigned, and why the last press would not do. */
  const [capturingId, setCapturingId] = useState<PlayerId | null>(null);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    setLineUp((current) => moveItem(current, from, to));
  };
  const reorder = useListReorder(move);

  const editPlayer = (id: PlayerId, change: Partial<GamePlayer>) => {
    setLineUp((current) =>
      current.map((player) => (player.id === id ? { ...player, ...change } : player)),
    );
  };

  // The same rules as the setup screen: a key the interface needs, or one
  // somebody else is already holding, is refused rather than quietly taken.
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

      const owner = findKeyOwner(lineUp, keyCode, targetId);

      if (owner) {
        setKeyProblem(t("setup.keyTaken", { key: keyCodeLabel(keyCode), name: owner.name }));

        return;
      }

      setKeyProblem(null);
      editPlayer(targetId, { keyCode });
      setCapturingId(null);
    },
    () => {
      setKeyProblem(null);
      setCapturingId(null);
    },
  );

  const apply = () => {
    onApply(
      Object.fromEntries(lineUp.map((player) => [player.id, toBalance(drafts[player.id] ?? "0")])),
      banned,
      // A name cleared and left that way would leave a nameless card on the
      // scoreboard, so the one the player came in with stands.
      lineUp.map((player) => ({
        ...player,
        name:
          player.name.trim() ||
          (players.find((original) => original.id === player.id)?.name ?? player.name),
      })),
    );
  };

  return (
    <Modal
      wide
      title={t("edit.title")}
      onClose={onCancel}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant={ButtonVariant.Secondary} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant={ButtonVariant.Primary} onClick={apply}>
            {t("edit.apply")}
          </Button>
        </>
      }
    >
      <ul className={styles.list} {...reorder.listProps}>
        {lineUp.map((player, index) => {
          const draft = drafts[player.id] ?? "0";
          const endsGame = toBalance(draft) >= targetMoney;
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
            <li
              key={player.id}
              className={rowClasses}
              style={{ "--player-colour": player.colour } as CSSProperties}
              {...reorder.rowProps(index)}
            >
              <div className={styles.identity}>
                <button
                  type="button"
                  className={styles.grip}
                  title={t("setup.reorder", { name: player.name })}
                  aria-label={t("setup.reorder", { name: player.name })}
                  onKeyDown={(event) => {
                    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;

                    if (step === 0) {
                      return;
                    }

                    event.preventDefault();
                    move(index, index + step);
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
                  label={t("edit.name")}
                  hideLabel
                  value={player.name}
                  maxLength={24}
                  onChange={(event) => editPlayer(player.id, { name: event.target.value })}
                />
              </div>

              <ColourSwatch
                className={styles.colour}
                colour={player.colour}
                label={t("setup.colourOf", { name: player.name })}
                onChange={(colour) => editPlayer(player.id, { colour })}
              />

              <div className={styles.keyCell}>
                <Keycap keyCode={player.keyCode} emptyLabel={t("setup.noKey")} />
                <Button
                  small
                  variant={
                    capturingId === player.id ? ButtonVariant.Primary : ButtonVariant.Secondary
                  }
                  onClick={() => {
                    setKeyProblem(null);
                    setCapturingId(capturingId === player.id ? null : player.id);
                  }}
                >
                  {capturingId === player.id ? t("setup.pressKey") : t("setup.changeKey")}
                </Button>
              </div>

              <Input
                className={styles.money}
                type="number"
                min={0}
                step={10}
                inputMode="numeric"
                // Kept for a screen reader, which has nothing else to tell it
                // whose balance this is, and off the screen, where the name is
                // already right beside it.
                label={t("edit.money", { name: player.name })}
                hideLabel
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [player.id]: event.target.value,
                  }))
                }
                hint={
                  endsGame
                    ? t("edit.willEndGame", {
                        target: formatMoney(targetMoney),
                      })
                    : undefined
                }
              />

              <Checkbox
                className={styles.ban}
                checked={banned.includes(player.id)}
                label={t("edit.ban")}
                onChange={(checked) =>
                  setBanned((current) =>
                    checked ? [...current, player.id] : current.filter((id) => id !== player.id),
                  )
                }
              />
            </li>
          );
        })}
      </ul>

      {capturingId !== null ? <p className={styles.capturing}>{t("setup.pressKeyHint")}</p> : null}
      {keyProblem ? (
        <p className={styles.problem} role="alert">
          {keyProblem}
        </p>
      ) : null}
    </Modal>
  );
}
