/**
 * Allowance maths for the import preview. The Session
 * summary's bookmark count includes trashed items (they hold quota), so
 * remaining = limit - count. The import proceeds even when over — it fills
 * the allowance depth-first and skips the rest — so the warning informs, it
 * never blocks. It gives the room left and no skip count: duplicates and
 * restores from Trash use no room, so the count can't be known beforehand.
 */
export interface AllowanceWarning {
  remaining: number;
}

export function allowanceWarningFor(
  importableCount: number,
  bookmarkCount: number,
  limit: number,
): AllowanceWarning | null {
  const remaining = Math.max(0, limit - bookmarkCount);
  if (importableCount <= remaining) return null;
  return { remaining };
}
