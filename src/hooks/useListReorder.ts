// Dragging a row to a new place in a list.
//
// Plain HTML drag and drop, which is all a list of a dozen rows on a desktop
// needs. The handle is what drags, never the row itself: a row holds a text
// field, and a draggable field cannot be selected with the mouse. Every list
// that uses this also offers buttons, so the order can be changed without a
// pointer at all.
//
// Where the row would land is worked out from the pointer against the rows'
// own positions, and it is worked out on the document rather than on the list.
// A row dragged clear of the list — above it, below it, off to one side — still
// has somewhere obvious to go, and letting go there has to mean that rather
// than meaning nothing.

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import { landingIndex } from "@/helpers/list";

/** Marks a row, so the drag can find them all and measure where they sit. */
const ROW_ATTRIBUTE = "data-reorder-row";

/** Where a row would land relative to the one being dragged over. */
export const DropEdge = {
  Above: "above",
  Below: "below",
} as const;

export type DropEdge = (typeof DropEdge)[keyof typeof DropEdge];

export type ListReorder = {
  /** The row in the air right now, which is drawn as having left its place. */
  draggingIndex: number | null;
  /** Which edge of a row the drop line belongs on, or null for no line. */
  dropEdge: (index: number) => DropEdge | null;
  /** Spread onto the element holding the rows. */
  listProps: { ref: (element: HTMLElement | null) => void };
  /** Spread onto the grip. */
  handleProps: (index: number) => {
    draggable: true;
    onDragStart: (event: DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Spread onto each row. */
  rowProps: (index: number) => Record<string, string>;
};

/**
 * Which gap between rows the pointer is asking for, counted 0 to the number of
 * rows — gap 0 is above the first row, gap n is below the last.
 *
 * Above the list means the top and below it means the bottom: those are the two
 * places a row is most often dragged to, and the two the pointer is most likely
 * to overshoot. In between, a row is passed once the pointer is past its middle,
 * so the list parts where the row would go.
 */
function pointerGap(container: HTMLElement, clientY: number): { gap: number; rows: number } | null {
  const rows = [...container.querySelectorAll(`[${ROW_ATTRIBUTE}]`)].map((row) =>
    row.getBoundingClientRect(),
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    gap: rows.filter((row) => clientY > row.top + row.height / 2).length,
    rows: rows.length,
  };
}

export function useListReorder(onMove: (from: number, to: number) => void): ListReorder {
  const containerRef = useRef<HTMLElement | null>(null);
  const fromRef = useRef<number | null>(null);
  const gapRef = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  /** The gap the row is aimed at, and how many rows there were when it was read. */
  const [aim, setAim] = useState<{ gap: number; rows: number } | null>(null);

  const listProps = {
    ref: useCallback((element: HTMLElement | null) => {
      containerRef.current = element;
    }, []),
  };

  const finish = useCallback(() => {
    fromRef.current = null;
    gapRef.current = null;
    setDraggingIndex(null);
    setAim(null);
  }, []);

  // Watched on the document, so a row dragged outside the list is still being
  // aimed somewhere. Only while a row is actually in the air.
  useEffect(() => {
    if (draggingIndex === null) {
      return;
    }

    const handleDragOver = (event: globalThis.DragEvent) => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      // Without this the browser refuses the drop and animates the row back.
      event.preventDefault();

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      const target = pointerGap(container, event.clientY);
      gapRef.current = target?.gap ?? null;
      setAim(target);
    };

    const handleDrop = (event: globalThis.DragEvent) => {
      const from = fromRef.current;
      const gap = gapRef.current;

      event.preventDefault();
      finish();

      if (from !== null && gap !== null) {
        onMove(from, landingIndex(from, gap));
      }
    };

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, [draggingIndex, finish, onMove]);

  const handleProps = useCallback(
    (index: number) =>
      ({
        draggable: true,
        onDragStart: (event: DragEvent) => {
          fromRef.current = index;
          gapRef.current = index;
          setDraggingIndex(index);
          // Firefox starts no drag at all unless something is carried.
          event.dataTransfer.setData("text/plain", String(index));
          event.dataTransfer.effectAllowed = "move";

          // Without this the pointer would carry a picture of the grip alone.
          // The whole row travels instead, held where it was picked up.
          const row = (event.currentTarget as HTMLElement).closest(`[${ROW_ATTRIBUTE}]`);

          if (row instanceof HTMLElement) {
            const bounds = row.getBoundingClientRect();

            event.dataTransfer.setDragImage(
              row,
              event.clientX - bounds.left,
              event.clientY - bounds.top,
            );
          }
        },
        // Fires on a drop as well as on a drag abandoned with Escape, so this
        // is what guarantees nothing is left looking lifted.
        onDragEnd: finish,
      }) as const,
    [finish],
  );

  const rowProps = useCallback((_index: number) => ({ [ROW_ATTRIBUTE]: "" }), []);

  /**
   * The line marks the gap the row is aimed at: under the row above it, or over
   * the first row when the gap is the top of the list. A gap either side of
   * where the row already is would move nothing, so it is left undrawn.
   */
  const dropEdge = useCallback(
    (index: number): DropEdge | null => {
      if (draggingIndex === null || aim === null) {
        return null;
      }

      if (aim.gap === draggingIndex || aim.gap === draggingIndex + 1) {
        return null;
      }

      if (aim.gap === 0) {
        return index === 0 ? DropEdge.Above : null;
      }

      return index === aim.gap - 1 ? DropEdge.Below : null;
    },
    [aim, draggingIndex],
  );

  return { draggingIndex, dropEdge, listProps, handleProps, rowProps };
}
