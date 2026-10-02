import styles from "./Spinner.module.scss";

type SpinnerProps = {
  /** Announced to screen readers while the spinner is on screen. */
  label: string;
  /** Shows the label next to the spinner instead of hiding it. */
  showLabel?: boolean;
};

export function Spinner({ label, showLabel = false }: SpinnerProps) {
  return (
    <div className={styles.wrapper} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={showLabel ? styles.label : styles.labelHidden}>{label}</span>
    </div>
  );
}
