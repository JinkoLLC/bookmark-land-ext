/**
 * Search-mode derivation for the Library panel: a non-empty trimmed term
 * switches the panel from browse to search; clearing it returns to browse.
 * The term lives in component state, so it resets when the panel reopens.
 */
export function searchTermFor(input: string): string | null {
  const term = input.trim();
  return term ? term : null;
}
