import { Button } from "../ui/Button";
import { ButtonVariant } from "../ui/buttonVariant";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Draws the confirming button as destructive. */
  destructive?: boolean;
};

/** A yes/no question — used before anything that throws work away. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      closeLabel={closeLabel}
      footer={
        <>
          <Button variant={ButtonVariant.Secondary} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? ButtonVariant.Negative : ButtonVariant.Primary}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
