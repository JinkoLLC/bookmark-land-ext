import { useRef, type RefObject } from "react";
import {
  clampTreeHeight,
  RESIZE_STEP,
  TREE_HEIGHT_KEY,
} from "@/utils/panel-layout";

/**
 * Draggable separator between the collection tree and the bookmark list.
 * Drag (or use Arrow Up/Down when focused) to resize; the height persists
 * across panel opens via localStorage.
 */
export function PanelDivider({
  treeRef,
  listRef,
  onResize,
}: {
  treeRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLElement | null>;
  onResize: (height: number) => void;
}) {
  const drag = useRef<{ startY: number; treeStart: number; listStart: number } | null>(null);
  const lastHeight = useRef<number | null>(null);

  const measure = () => ({
    treeStart: treeRef.current?.getBoundingClientRect().height ?? 0,
    listStart: listRef.current?.getBoundingClientRect().height ?? 0,
  });

  const apply = (height: number) => {
    lastHeight.current = height;
    onResize(height);
  };

  // Persisted once per gesture, not on every pointermove.
  const persist = () => {
    if (lastHeight.current !== null) {
      localStorage.setItem(TREE_HEIGHT_KEY, String(lastHeight.current));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize collections panel"
      title="Drag to resize"
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startY: e.clientY, ...measure() };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { startY, treeStart, listStart } = drag.current;
        apply(
          clampTreeHeight(treeStart + e.clientY - startY, treeStart, listStart),
        );
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        persist();
      }}
      onPointerCancel={() => {
        drag.current = null;
        persist();
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const { treeStart, listStart } = measure();
        const delta = e.key === "ArrowUp" ? -RESIZE_STEP : RESIZE_STEP;
        apply(clampTreeHeight(treeStart + delta, treeStart, listStart));
        persist();
      }}
      className="h-1.5 shrink-0 cursor-row-resize bg-neutral-200 hover:bg-neutral-300 focus-visible:outline-2 focus-visible:outline-ring dark:bg-neutral-800 dark:hover:bg-neutral-700"
    />
  );
}
