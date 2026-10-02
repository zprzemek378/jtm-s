// Playing the game's own sound effects.
//
// One element per file, reused: a cue that fires twice in quick succession
// restarts rather than stacking up copies that drift out of time. What is
// currently sounding for each moment is remembered too, because some cues
// belong to a moment that ends — a countdown is pointless once the music is
// playing, and a ten-second fanfare should not follow the table into the next
// game.

import type { SoundEvent } from '@/constants/soundChoices'
import { isSoundEnabled } from '@/settings/sound'

import { pickChoice } from './sounds'
import { SOUND_CHOICES } from '@/constants/soundChoices'
import { availableFiles, fileUrl } from './soundFiles'

const elements = new Map<string, HTMLAudioElement>()

/** What is sounding for each moment, and whether it may be cut off. */
const sounding = new Map<SoundEvent, { element: HTMLAudioElement; cutShort: boolean }>()

function elementFor(url: string): HTMLAudioElement {
  const known = elements.get(url)

  if (known) {
    return known
  }

  const element = new Audio(url)
  element.preload = 'auto'
  elements.set(url, element)

  return element
}

function start(element: HTMLAudioElement): void {
  try {
    element.currentTime = 0
    void element.play().catch(() => undefined)
  } catch {
    // An element that cannot be rewound or played is not worth a broken round.
  }
}

/**
 * Draws a sound for this moment and plays it, if sound is switched on.
 *
 * Nothing here can interrupt a game: a missing file, a browser that refuses to
 * play before a gesture, a draw that landed on silence — all are simply quiet.
 */
export function playSound(event: SoundEvent): void {
  if (!isSoundEnabled()) {
    return
  }

  const choice = pickChoice(SOUND_CHOICES[event] ?? [])
  const url = choice?.file ? fileUrl(choice.file) : null

  if (!url) {
    return
  }

  const element = elementFor(url)
  sounding.set(event, { element, cutShort: choice?.cutShort === true })
  start(element)
}

/**
 * Silences this moment's sound, if it is one that may be cut off.
 *
 * A sound without `cutShort` is left to ring out — that is the default, and
 * the whole point of marking the exceptions.
 */
export function stopSound(event: SoundEvent): void {
  const playing = sounding.get(event)

  if (!playing?.cutShort) {
    return
  }

  sounding.delete(event)

  try {
    playing.element.pause()
    playing.element.currentTime = 0
  } catch {
    // Nothing to do; it will simply finish on its own.
  }
}

/** Silences every cue that may be cut off — used when a game screen closes. */
export function stopCutShortSounds(): void {
  for (const event of [...sounding.keys()]) {
    stopSound(event)
  }
}

/**
 * Fetches every file so the first cue of a game is not late.
 *
 * Called from the click that starts a game, which is also the gesture browsers
 * want before they will play anything.
 */
export function primeSounds(): void {
  for (const name of availableFiles()) {
    const url = fileUrl(name)

    if (url) {
      elementFor(url).load()
    }
  }
}
