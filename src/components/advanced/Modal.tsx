import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import styles from "./Modal.module.scss";

type ModalProps = {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  /** Buttons pinned to the bottom of the dialog. */
  footer?: ReactNode;
};

/** Dialog rendered into <body>, so no scroll container can clip it. */
export function Modal({ title, onClose, closeLabel, children, footer }: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button
            small
            variant={ButtonVariant.Ghost}
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        <div className={styles.content}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
