// Whether simultaneous presses count as a tie, and how close is simultaneous.
//
// It lives beside the keyboard probe in Settings for a reason: the probe is how
// a host finds out what their own keyboard and browser can actually resolve,
// and that number is what belongs here.

import {
  DEFAULT_TIE_THRESHOLD_MS,
  MAX_TIE_THRESHOLD_MS,
  MIN_TIE_THRESHOLD_MS,
} from "@/constants/gameRules";
import { STORAGE_KEYS, readStoredString, writeStoredString } from "@/storage/localStorage";

/**
 * On unless it was explicitly switched off.
 *
 * Simultaneous presses are the situation this game runs into constantly — eight
 * people around one keyboard — so judging them a tie is the sensible starting
 * point. The threshold is tunable right beside the keyboard probe for anyone
 * whose hardware disagrees.
 */
export function areTiesEnabled(): boolean {
  return readStoredString(STORAGE_KEYS.tiesEnabled) !== "false";
}

export function setTiesEnabled(enabled: boolean): void {
  writeStoredString(STORAGE_KEYS.tiesEnabled, String(enabled));
}

export function clampTieThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TIE_THRESHOLD_MS;
  }

  return Math.min(MAX_TIE_THRESHOLD_MS, Math.max(MIN_TIE_THRESHOLD_MS, value));
}

export function readTieThreshold(): number {
  const stored = readStoredString(STORAGE_KEYS.tieThreshold);

  if (stored === null) {
    return DEFAULT_TIE_THRESHOLD_MS;
  }

  const parsed = Number.parseFloat(stored);

  return Number.isFinite(parsed) ? clampTieThreshold(parsed) : DEFAULT_TIE_THRESHOLD_MS;
}

export function writeTieThreshold(value: number): void {
  writeStoredString(STORAGE_KEYS.tieThreshold, String(clampTieThreshold(value)));
}

/** The threshold a game should run with: null when ties are switched off. */
export function activeTieThreshold(): number | null {
  return areTiesEnabled() ? readTieThreshold() : null;
}
