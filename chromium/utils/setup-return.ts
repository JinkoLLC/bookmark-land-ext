/**
 * The web app's onboarding asks the extension to open its Browser import
 * (`open-import`, sent through externally_connectable) and passes its own tab
 * id along, so the import's last screen can bring the visitor back to setup.
 */
export const OPEN_IMPORT_MESSAGE = "open-import";

const RETURN_PARAM = "return";

/** The import page's path, carrying the web app tab to return to when there is one. */
export function importPagePath(senderTabId: number | undefined): `/import.html${string}` {
  return Number.isSafeInteger(senderTabId) && (senderTabId as number) >= 0
    ? `/import.html?${RETURN_PARAM}=${senderTabId}`
    : "/import.html";
}

/** The tab id in the import page's query string, or null when absent or malformed. */
export function parseReturnTabId(search: string): number | null {
  const value = new URLSearchParams(search).get(RETURN_PARAM);
  if (value === null || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
