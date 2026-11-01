// URL helpers. normalizeUrl must agree with the backend's, which decides whether
// a URL is already saved, so a change to its rules belongs in both places.
import trackingParams from "./tracking-params.json";

/**
 * Normalizes a URL for consistent duplicate detection.
 * - Lowercase hostname
 * - Default to https
 * - Remove trailing slashes
 * - Remove common tracking params (utm_*, fbclid, gclid, etc.)
 * - Remove www. prefix
 * - Remove hash fragments
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    let url = new URL(rawUrl.trim());

    if (url.protocol === "http:") {
      url = new URL(url.href.replace(/^http:/, "https:"));
    }

    url.hostname = url.hostname.toLowerCase();

    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
    }

    trackingParams.forEach((param) => url.searchParams.delete(param));

    url.hash = "";

    // Strip the path's trailing slash before serializing. Testing the
    // serialized string instead missed every URL with a query string, because
    // the slash is no longer the last character there.
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Extract domain from a URL for grouping.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Validate that a raw URL string is a safe, well-formed http(s) URL.
 */
export function isValidUrl(rawUrl: string): boolean {
  try {
    const trimmedUrl = rawUrl.trim();
    if (/[\0-\x1f\x7f]/.test(trimmedUrl)) return false;
    // `new URL()` percent-encodes interior whitespace instead of
    // rejecting it, so a mangled CSV cell like
    // `https://a.example.com/c, unterminated quote` parsed as a valid URL and
    // was imported as a bookmark. A real URL never contains a raw space.
    //
    // ASCII only (tab/CR/LF are already covered by the control check above):
    // U+00A0 and the other Unicode spaces are legal in a path, and `new URL()`
    // percent-encodes them into a working URL.
    if (/[ \t\r\n]/.test(trimmedUrl)) return false;
    const url = new URL(trimmedUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (!url.hostname || url.hostname.startsWith(".") || url.hostname.endsWith(".")) return false;
    if (url.hostname.includes("..")) return false;
    return true;
  } catch {
    return false;
  }
}
