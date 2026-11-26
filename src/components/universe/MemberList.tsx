// Who is in a universe, and the four things only its owner may do.

import { useState } from "react";

import { API, type Account, type Universe, type UniverseMember } from "@jtm-s/shared";

import { useBackend } from "@/backend/useBackend";
import { Button } from "@/components/ui/Button";
import { ButtonVariant } from "@/components/ui/buttonVariant";
import { Panel } from "@/components/ui/Panel";
import { useLanguage } from "@/i18n/useLanguage";

import styles from "./UniverseDetail.module.scss";

type MemberListProps = {
  universe: Universe;
  members: readonly UniverseMember[];
  /** Everyone who has ever signed in, to pick new members from. */
  accounts: readonly Account[];
  onChanged: () => void;
  onFailure: (message: string) => void;
};

export function MemberList({ universe, members, accounts, onChanged, onFailure }: MemberListProps) {
  const { t } = useLanguage();
  const { account, request } = useBackend();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = account?.id === universe.ownerId;
  const outsiders = accounts.filter(
    (candidate) => !members.some((member) => member.account.id === candidate.id),
  );

  /** Runs one change and reloads, or reports why it did not happen. */
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

  return (
    <Panel title={t("universe.members")} meta={members.length}>
      <ul className={styles.rows}>
        {members.map((member) => {
          const self = member.account.id === account?.id;
          const owner = member.account.id === universe.ownerId;

          return (
            <li key={member.account.id} className={styles.row}>
              <span className={styles.rowName}>
                {member.account.displayName}
                {owner ? <span className={styles.badge}>{t("universe.owner")}</span> : null}
                {self && !owner ? <span className={styles.badge}>{t("universe.you")}</span> : null}
              </span>

              <div className={styles.rowActions}>
                {isOwner && !owner ? (
                  <Button
                    small
                    variant={ButtonVariant.Ghost}
                    disabled={busy}
                    onClick={() =>
                      void change(() =>
                        request(API.owner(universe.id), {
                          method: "PUT",
                          body: { accountId: member.account.id },
                        }),
                      )
                    }
                  >
                    {t("universe.handOver")}
                  </Button>
                ) : null}

                {/* The owner cannot be removed and cannot simply leave: they
                    hand the universe over first, so it is never left without
                    one. Anybody else can go, or be shown out by the owner. */}
                {!owner && (isOwner || self) ? (
                  <Button
                    small
                    variant={ButtonVariant.Ghost}
                    disabled={busy}
                    onClick={() =>
                      void change(() =>
                        request(API.member(universe.id, member.account.id), { method: "DELETE" }),
                      )
                    }
                  >
                    {self ? t("universe.leave") : t("universe.remove")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {outsiders.length > 0 ? (
        <div className={styles.addRow}>
          <label className={styles.addLabel} htmlFor="universe-add-member">
            {t("universe.addMember")}
          </label>
          <select
            id="universe-add-member"
            className={styles.select}
            value={adding}
            disabled={busy}
            onChange={(event) => setAdding(event.target.value)}
          >
            <option value="">{t("universe.pickAccount")}</option>
            {outsiders.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.displayName}
              </option>
            ))}
          </select>
          <Button
            small
            variant={ButtonVariant.Secondary}
            disabled={busy || adding === ""}
            onClick={() =>
              void change(async () => {
                await request(API.members(universe.id), {
                  method: "POST",
                  body: { accountId: adding },
                });
                setAdding("");
              })
            }
          >
            {t("universe.add")}
          </Button>
        </div>
      ) : null}

      <p className={styles.hint}>{t("universe.membersHint")}</p>
    </Panel>
  );
}
