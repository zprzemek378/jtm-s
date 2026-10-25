import type { CSSProperties } from "react";

import styles from "./ColourSwatch.module.scss";

type ColourSwatchProps = {
  /** The colour, as `#rrggbb` — what a colour input understands. */
  colour: string;
  onChange: (colour: string) => void;
  /** Says whose colour this is, for the label and the tooltip. */
  label: string;
  className?: string;
};

/**
 * A player's colour, and the way to change it.
 *
 * A filled rectangle, which is what a colour control looks like everywhere
 * else — somebody seeing this screen for the first time should not have to
 * discover that an avatar is a button. The browser's own picker does the
 * choosing: it has the whole space, a dropper and the system's recent colours,
 * none of which a hand-made palette would match. The input itself is invisible
 * and covers the swatch, so the thing that opens it is the colour it changes.
 */
export function ColourSwatch({ colour, onChange, label, className }: ColourSwatchProps) {
  return (
    <span
      className={className ? `${styles.swatch} ${className}` : styles.swatch}
      style={{ "--player-colour": colour } as CSSProperties}
      title={label}
    >
      <input
        className={styles.input}
        type="color"
        value={colour}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}
