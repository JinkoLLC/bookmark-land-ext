/**
 * Where an arrow key (or Home/End) moves the highlight in a list of `count`
 * items, wrapping at the ends; null for any other key or an empty list.
 * `index` is -1 when nothing is highlighted yet.
 */
export function moveIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return index <= 0 ? count - 1 : index - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
