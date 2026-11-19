import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  clampTreeHeight,
  dividerPercents,
  RESIZE_STEP,
  TREE_HEIGHT_KEY,
} from "@/utils/panel-layout";

const STEP_BUTTON =
  "flex h-6 w-6 items-center justify-center text-neutral-700 first:rounded-l-full last:rounded-r-full enabled:hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-neutral-400 dark:text-neutral-200 dark:enabled:hover:bg-neutral-800 dark:disabled:text-neutral-500";

/**
 * Draggable separator between the collection tree and the bookmark list.
 * Drag, use Arrow Up/Down when focused, or press its two buttons to resize;
 * the height persists across panel opens via localStorage.
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

  const step = (delta: number) => {
    const { treeStart, listStart } = measure();
    apply(clampTreeHeight(treeStart + delta, treeStart, listStart));
    persist();
  };

  // The separator's value follows the two sections however they change size
  // (a drag, the window, the tree's content).
  const [value, setValue] = useState({ now: 0, min: 0, max: 100 });
  useEffect(() => {
    const tree = treeRef.current;
    const list = listRef.current;
    if (!tree || !list) return;
    const update = () => {
      const next = dividerPercents(
        tree.getBoundingClientRect().height,
        list.getBoundingClientRect().height,
        window.innerHeight,
      );
      setValue((previous) =>
        previous.now === next.now && previous.min === next.min && previous.max === next.max
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(tree);
    observer.observe(list);
    return () => observer.disconnect();
  }, [treeRef, listRef]);

  return (
    // 24 px tall so the line's hit area and the two buttons never cover a row.
    <div className="group relative h-6 shrink-0">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-neutral-200 dark:bg-neutral-800" />
      {/* Grip: says the line can be dragged. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-400 group-hover:bg-neutral-500 dark:bg-neutral-500 dark:group-hover:bg-neutral-400" />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize collections panel"
        aria-valuenow={value.now}
        aria-valuemin={value.min}
        aria-valuemax={value.max}
        aria-valuetext={`Collections take ${value.now}% of the panel`}
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
          step(e.key === "ArrowUp" ? -RESIZE_STEP : RESIZE_STEP);
        }}
        // The ring is drawn inside: the area spans the panel, so an outer ring would be cut off.
        className="absolute inset-0 cursor-row-resize focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      />
      {/* One pill for the pair. Its border is drawn over the buttons, so they stay 24 px inside the 24 px row. */}
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 rounded-full bg-white after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:border after:border-neutral-300 dark:bg-neutral-900 dark:after:border-neutral-700">
        <button
          type="button"
          aria-label="Show more collections"
          title="Show more collections"
          disabled={value.now >= value.max}
          onClick={() => step(RESIZE_STEP)}
          className={STEP_BUTTON}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Show fewer collections"
          title="Show fewer collections"
          disabled={value.now <= value.min}
          onClick={() => step(-RESIZE_STEP)}
          className={STEP_BUTTON}
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
