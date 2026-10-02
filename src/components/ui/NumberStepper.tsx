import { useId, type ReactNode } from "react";

import { Button } from "./Button";
import { ButtonVariant } from "./buttonVariant";
import styles from "./NumberStepper.module.scss";

type NumberStepperProps = {
  value: number;
  min: number;
  max: number;
  /** How much one press moves the value. */
  step?: number;
  onChange: (value: number) => void;
  label: string;
  hint?: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** Renders the value — money, seconds, whatever the number means. */
  format?: (value: number) => ReactNode;
};

/**
 * A whole number chosen with two buttons — the shape that works for counts the
 * host nudges up and down, such as the score a game is played to.
 */
export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  hint,
  decreaseLabel,
  increaseLabel,
  format,
}: NumberStepperProps) {
  const id = useId();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={styles.field}>
      <span className={styles.label} id={id}>
        {label}
      </span>
      <div className={styles.control} role="group" aria-labelledby={id}>
        <Button
          small
          iconOnly
          variant={ButtonVariant.Secondary}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          aria-label={decreaseLabel}
          title={decreaseLabel}
        >
          <span aria-hidden="true">−</span>
        </Button>
        <output className={styles.value}>{format ? format(value) : value}</output>
        <Button
          small
          iconOnly
          variant={ButtonVariant.Secondary}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          aria-label={increaseLabel}
          title={increaseLabel}
        >
          <span aria-hidden="true">+</span>
        </Button>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
