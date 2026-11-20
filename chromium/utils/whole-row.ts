/**
 * Shortens a scrolling box whose rows don't all fit, so that at rest it ends
 * `after` px under the last row that fits whole: a row cut mid-line under the
 * fade reads as broken. A box that fits everything keeps its own height.
 */
export function endOnWholeRow(box: HTMLElement, rows: Iterable<Element>, after: number) {
  box.style.maxHeight = "";
  if (box.scrollHeight <= box.clientHeight) return;
  const { top, bottom } = box.getBoundingClientRect();
  const border = parseFloat(getComputedStyle(box).borderBottomWidth) || 0;
  // Where the box would end under each row, as the rows lie before any scrolling.
  const ends = [...rows]
    .map((row) => row.getBoundingClientRect().bottom + box.scrollTop + after + border)
    .filter((end) => end <= bottom + 0.5);
  if (ends.length > 0) box.style.maxHeight = `${Math.max(...ends) - top}px`;
}
