/** Pure keyboard logic for the Library panel's collection tree and its row menu. */

/** One visible tree row, in display order. */
export type TreeKeyItem = {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

export type TreeKeyAction =
  | { type: "focus"; index: number }
  | { type: "toggle"; index: number; isExpanded: boolean }
  | { type: "select"; index: number }
  | { type: "menu"; index: number };

/**
 * What a key press on the row at `index` does (the WAI-ARIA tree pattern).
 * null = not a tree key, or nowhere to go: leave the event alone.
 */
export function treeKeyAction(
  key: string,
  shiftKey: boolean,
  items: ReadonlyArray<TreeKeyItem>,
  index: number,
): TreeKeyAction | null {
  const item = items[index];
  if (!item) return null;
  const focus = (target: number): TreeKeyAction | null =>
    target >= 0 && target < items.length && target !== index
      ? { type: "focus", index: target }
      : null;

  switch (key) {
    case "ArrowDown":
      return focus(index + 1);
    case "ArrowUp":
      return focus(index - 1);
    case "Home":
      return focus(0);
    case "End":
      return focus(items.length - 1);
    case "ArrowRight":
      if (!item.hasChildren) return null;
      // An open row's first child is the next visible row.
      return item.isExpanded ? focus(index + 1) : { type: "toggle", index, isExpanded: true };
    case "ArrowLeft": {
      if (item.hasChildren && item.isExpanded) return { type: "toggle", index, isExpanded: false };
      for (let parent = index - 1; parent >= 0; parent--) {
        if (items[parent].depth < item.depth) return focus(parent);
      }
      return null;
    }
    case "Enter":
    case " ":
      return { type: "select", index };
    case "ContextMenu":
      return { type: "menu", index };
    case "F10":
      return shiftKey ? { type: "menu", index } : null;
    default:
      return null;
  }
}

/** The menu item an arrow, Home or End key moves to (wrapping); null for any other key. */
export function menuKeyIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
