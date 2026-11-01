# Browser extension is capture-first; native browser bookmarks are import-only, never synced

The original idea for the extension was a "bookmarkland" folder in Chrome's native bookmarks with two-way sync. We researched the market (2026-06): no surviving bookmark SaaS (Raindrop, Pocket, Pinboard, Linkwarden, Karakeep) writes to the native tree — all are capture-first with one-time import. The tools that did attempt two-way native sync are abandoned (xBrowserSync), broken (EverSync), or carry years of data-loss bug reports despite hardening (Floccus, which had to add a "block syncs deleting >X% of bookmarks" failsafe). Root causes: Chrome's own account sync acts as a hostile concurrent writer, and the native tree (folders only) cannot losslessly represent our model (tags, notes, highlights, favorite/trash states).

We decided: the extension saves pages into BookmarkLand (Quick save), offers a one-time **Browser import** (read-only `chrome.bookmarks`, folder hierarchy → Collections), and surfaces the library in-browser via a **Library panel** — it never writes to the native bookmark tree.

## Considered Options

- True two-way sync with a native folder — rejected for the data-loss tail risk and model mismatch above.
- One-way cloud → native mirror folder — rejected for v1; Chrome-sync duplication risk remains and the Library panel covers the need.
- Exposing a Floccus-compatible backend on the existing REST API — deferred; the cheapest credible path if real demand for native-tree sync ever appears (this is how Linkwarden and Karakeep answer it).
