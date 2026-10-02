import { useCallback, useEffect, useRef, useState } from "react";

import { keyCodeLabel } from "@/helpers/keys";
import {
  formatInterval,
  intervalStats,
  measureClockResolution,
  pressTime,
  type KeyPress,
} from "@/helpers/keyboardLog";
import { useLanguage } from "@/i18n/useLanguage";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import styles from "./KeyboardProbe.module.scss";

/** Enough history to see a pattern, bounded so a long session cannot grow forever. */
const MAX_PRESSES = 200;

/** Keys left alone while listening, so the probe can always be escaped. */
const PASS_THROUGH = ["Tab", "Escape", "F5", "F12"];

/**
 * Logs key presses and the gaps between them.
 *
 * Aimed at the question this game actually raises: whether one keyboard can
 * register several players hammering different keys at the same instant.
 */
export function KeyboardProbe() {
  const { t } = useLanguage();
  const [listening, setListening] = useState(false);
  const [presses, setPresses] = useState<readonly KeyPress[]>([]);
  const [resolution, setResolution] = useState<number | null>(null);

  /** Kept in a ref so the handler never needs re-binding mid-measurement. */
  const lastAtRef = useRef<number | null>(null);
  const nextIdRef = useRef(1);

  const clear = useCallback(() => {
    setPresses([]);
    lastAtRef.current = null;
  }, []);

  const toggleListening = useCallback(() => {
    setListening((value) => !value);
    // Measured here rather than in an effect: it spins the CPU briefly, so it
    // belongs to the click that asked for it, and the answer is a property of
    // the page that never changes.
    setResolution((current) => current ?? measureClockResolution());
  }, []);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setListening(false);

        return;
      }

      // Holding a key down says nothing about how fast presses arrive.
      if (event.repeat) {
        return;
      }

      if (!PASS_THROUGH.includes(event.key)) {
        // Otherwise Space scrolls the page out from under the log.
        event.preventDefault();
      }

      const { at, fromEvent } = pressTime(event.timeStamp, performance.now());
      const previous = lastAtRef.current;
      lastAtRef.current = at;

      const press: KeyPress = {
        id: nextIdRef.current,
        at,
        code: event.code,
        key: event.key,
        deltaMs: previous === null ? null : at - previous,
        fromEvent,
      };

      nextIdRef.current += 1;
      setPresses((current) => [press, ...current].slice(0, MAX_PRESSES));
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [listening]);

  const stats = intervalStats(presses);

  return (
    <div className={styles.probe}>
      <p className={styles.intro}>{t("settings.keyboardIntro")}</p>

      <div className={styles.actions}>
        <Button
          variant={listening ? ButtonVariant.Negative : ButtonVariant.Primary}
          onClick={toggleListening}
        >
          {listening ? t("settings.keyboardStop") : t("settings.keyboardStart")}
        </Button>
        <Button variant={ButtonVariant.Secondary} disabled={presses.length === 0} onClick={clear}>
          {t("settings.keyboardClear")}
        </Button>
        <span className={listening ? styles.live : styles.idle}>
          {listening ? t("settings.keyboardListening") : t("settings.keyboardIdle")}
        </span>
      </div>

      {stats ? (
        <p className={styles.stats}>
          {t("settings.keyboardStats", {
            min: formatInterval(stats.minMs),
            max: formatInterval(stats.maxMs),
            mean: formatInterval(stats.meanMs),
            count: stats.count,
          })}
        </p>
      ) : null}

      {presses.length === 0 ? (
        <p className={styles.note}>{t("settings.keyboardEmpty")}</p>
      ) : (
        <ol className={styles.log}>
          <li className={styles.head} aria-hidden="true">
            <span className={styles.cellKey}>{t("settings.keyboardColumnKey")}</span>
            <span className={styles.cellCode}>{t("settings.keyboardColumnCode")}</span>
            <span className={styles.cellGap}>{t("settings.keyboardColumnGap")}</span>
          </li>
          {presses.map((press) => (
            <li key={press.id} className={styles.row}>
              <span className={styles.cellKey}>
                <span className={styles.keycap}>{keyCodeLabel(press.code)}</span>
              </span>
              <span className={styles.cellCode}>
                {press.code}
                {press.fromEvent ? "" : ` · ${t("settings.keyboardFallback")}`}
              </span>
              <span className={styles.cellGap}>
                {press.deltaMs === null ? (
                  t("settings.keyboardFirst")
                ) : press.deltaMs === 0 ? (
                  // Not a measured zero: the clock simply could not separate
                  // these two presses. Saying "0.000 ms" would claim precision
                  // the browser never offered.
                  <span className={styles.sameTick}>
                    {t("settings.keyboardSameTick", {
                      value: formatInterval(resolution ?? 0),
                    })}
                  </span>
                ) : (
                  formatInterval(press.deltaMs)
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {resolution === null ? null : (
        <p className={styles.note}>
          {t("settings.keyboardResolution", {
            value: formatInterval(resolution),
          })}
        </p>
      )}
      {stats && stats.sameTick > 0 ? (
        <p className={styles.note}>
          {t("settings.keyboardSameTickNote", { count: stats.sameTick })}
        </p>
      ) : null}
      <p className={styles.note}>{t("settings.keyboardRepeatNote")}</p>
      <p className={styles.note}>{t("settings.keyboardAccuracy")}</p>
    </div>
  );
}
