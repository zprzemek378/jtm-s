// Turning a KeyboardEvent into a player's buzzer.
//
// The identity of a buzzer is `event.code` — the physical key — so a player who
// happens to hold Shift, or whose layout maps the key elsewhere, still buzzes.
// The label shown on screen is derived from that code.

/**
 * Keys that cannot become buzzers.
 *
 * Some belong to the interface: Escape cancels key capture, Tab moves focus,
 * Enter and Space confirm the host's controls, and Backspace rejects an answer,
 * so a player holding one would fire the host's controls instead of buzzing.
 *
 * The rest belong to the machine. Ctrl and the Windows key are modifiers the
 * browser and the system read first — Ctrl turns every other buzzer into a
 * shortcut, and the Windows key opens the Start menu over the game — and the
 * menu key opens a context menu on top of it. None of them can be taken back by
 * `preventDefault`, so they are kept out of players' hands instead.
 */
export const RESERVED_KEY_CODES: readonly string[] = [
  "Escape",
  "Tab",
  "Enter",
  "NumpadEnter",
  "Space",
  "Backspace",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ContextMenu",
];

/** Codes whose label cannot be derived by stripping a prefix. */
const KEY_LABELS: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ShiftLeft: "Shift L",
  ShiftRight: "Shift R",
  ControlLeft: "Ctrl L",
  ControlRight: "Ctrl R",
  AltLeft: "Alt L",
  AltRight: "Alt R",
  MetaLeft: "Win L",
  MetaRight: "Win R",
  ContextMenu: "Menu",
  Backspace: "Backspace",
  Delete: "Del",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
};

export function isReservedKeyCode(code: string): boolean {
  return RESERVED_KEY_CODES.includes(code);
}

/** A short, printable name for a physical key, e.g. `KeyQ` becomes `Q`. */
export function keyCodeLabel(code: string): string {
  const mapped = KEY_LABELS[code];

  if (mapped) {
    return mapped;
  }

  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  if (code.startsWith("Numpad")) {
    return `Num ${code.slice(6)}`;
  }

  return code;
}

/**
 * Input types that take no typed text, so a key pressed while one of them has
 * focus is not somebody writing — it is a buzzer or a shortcut.
 *
 * This distinction matters: the volume slider during a game is an `<input>`, and
 * treating every input as text entry would silence every buzzer for as long as
 * the host happened to leave focus on it.
 */
const NON_TEXT_INPUT_TYPES = [
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
];

/** Whether a key press belongs to whatever is being typed into. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }

  return target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.includes(target.type);
}
