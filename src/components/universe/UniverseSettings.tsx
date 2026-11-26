// The two things that belong to whoever made a universe: its name, and whether
// it goes on existing at all.
//
// Deleting takes the history with it — the games, every event in them and the
// players — so it asks first and says what it is about to lose.

import { useState } from "react";

import { API, type UpdateUniverseRequest, type Universe } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { ConfirmDialog } from "@/components/advanced/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniverseDetail.module.scss";

type UniverseSettingsProps = {
  universe: Universe;
  /** How many games would go with it, so the question can say so. */
  games: number;
  /** The name changed, or the universe is gone. */
  onChanged: () => void;
  onDeleted: () => void;
  onFailure: (message: string) => void;
};

export function UniverseSettings({
  universe,
  games,
  onChanged,
  onDeleted,
  onFailure,
}: UniverseSettingsProps) {
  const { t } = useLanguage();
  const { request } = useBackend();
  const [name, setName] = useState(universe.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = async (act: () => Promise<unknown>, after: () => void) => {
    setBusy(true);

    try {
      await act();
      after();
    } catch (thrown) {
      onFailure(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t("universe.settings")}>
      <div className={styles.addRow}>
        <Input
          className={styles.rowInput}
          label={t("universe.newName")}
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          small
          variant={ButtonVariant.Secondary}
          disabled={busy || name.trim().length === 0 || name.trim() === universe.name}
          onClick={() =>
            void run(
              () =>
                request(API.universe(universe.id), {
                  method: "PATCH",
                  body: { name: name.trim() } satisfies UpdateUniverseRequest,
                }),
              onChanged,
            )
          }
        >
          {t("universe.rename")}
        </Button>
      </div>

      <div className={styles.addRow}>
        <Button
          small
          variant={ButtonVariant.Negative}
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {t("universe.delete")}
        </Button>
      </div>

      <p className={styles.hint}>{t("universe.deleteHint")}</p>

      {confirming ? (
        <ConfirmDialog
          destructive
          title={t("universe.delete")}
          message={t("universe.deleteConfirm", { name: universe.name, count: games })}
          confirmLabel={t("universe.deleteConfirmYes")}
          cancelLabel={t("common.cancel")}
          closeLabel={t("common.close")}
          onConfirm={() => {
            setConfirming(false);
            void run(() => request(API.universe(universe.id), { method: "DELETE" }), onDeleted);
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Panel>
  );
}
