/**
 * Allowance maths for the import preview. The Session
 * summary's bookmark count includes trashed items (they hold quota), so
 * remaining = limit - count. The import proceeds even when over — it fills
 * the allowance depth-first and skips the rest — so the warning informs, it
 * never blocks.
 */
export interface AllowanceWarning {
  remaining: number;
  willImport: number;
  willSkip: number;
}

export function allowanceWarningFor(
  importableCount: number,
  bookmarkCount: number,
  limit: number,
): AllowanceWarning | null {
  const remaining = Math.max(0, limit - bookmarkCount);
  if (importableCount <= remaining) return null;
  return {
    remaining,
    willImport: remaining,
    willSkip: importableCount - remaining,
  };
}
