/** `siteSecurity.flaggedSites` reads at most this many Sites per call (MAX_SITES). */
export const SITES_PER_QUERY = 500;

/**
 * The distinct, non-empty Sites among `domains`, sorted (a stable query
 * argument) and split into `flaggedSites`-sized batches, so a Library list
 * loaded past 500 distinct Sites still gets every warning.
 */
export function siteBatches(
  domains: ReadonlyArray<string>,
  size = SITES_PER_QUERY,
): string[][] {
  const sites = [...new Set(domains.filter(Boolean))].sort();
  const batches: string[][] = [];
  for (let i = 0; i < sites.length; i += size) batches.push(sites.slice(i, i + size));
  return batches;
}
