/** Pure layout logic for the Library panel's resizable tree/list split
 * and the collection context menu placement. */

export const MIN_TREE_HEIGHT = 80;
export const MIN_LIST_HEIGHT = 120;
export const RESIZE_STEP = 24;
export const TREE_HEIGHT_KEY = "library-panel:tree-height";

/** Menu box estimate used to keep it inside the panel viewport. */
export const MENU_WIDTH = 176;
export const MENU_HEIGHT = 44;

/**
 * Clamp a desired tree height so the tree keeps a usable minimum and the
 * bookmark list below it never shrinks past its own minimum. The available
 * room is whatever the two sections occupy at drag start.
 */
export function clampTreeHeight(
  desired: number,
  treeStart: number,
  listStart: number,
): number {
  const max = Math.max(treeStart + listStart - MIN_LIST_HEIGHT, MIN_TREE_HEIGHT);
  return Math.min(Math.max(desired, MIN_TREE_HEIGHT), max);
}

/** Parse a persisted tree height; anything non-numeric or non-positive is ignored. */
export function parseStoredHeight(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** Pin the context menu inside the viewport, never past the right/bottom edge. */
export function menuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  return {
    left: Math.max(0, Math.min(x, viewportWidth - MENU_WIDTH)),
    top: Math.max(0, Math.min(y, viewportHeight - MENU_HEIGHT)),
  };
}
