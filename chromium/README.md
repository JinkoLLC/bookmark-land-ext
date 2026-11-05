# bookmark.land for Chromium browsers

Manifest V3 extension (WXT + React + Tailwind v4). Capture-first: it saves
pages into bookmark.land and never writes to the native browser bookmark
tree ([ADR-0001](../docs/adr/0001-capture-first-no-native-sync.md)).

## Setup

```bash
cd chromium
cp .env.example .env   # fill in values (see comments in the file)
npm ci                 # also runs `wxt prepare` (generates .wxt/)
```

## Develop / build / verify

```bash
npm run dev       # dev mode with HMR (opens a Chromium profile)
npm run build     # production build → .output/chrome-mv3/
npm run compile   # type-check (tsc --noEmit)
npm run lint      # eslint
npm run test      # vitest unit tests
```

Load unpacked: `chrome://extensions` → enable Developer mode → "Load
unpacked" → select `chromium/.output/chrome-mv3/`.

## Environment and production links

All extension links to the web app come from build-time WXT env vars.
Local development uses `chromium/.env`, where `WXT_WEB_APP_URL` normally points
at `http://localhost:3000`. A production/store build must use production env
values so the same buttons point at `https://bookmark.land` instead.

For production packaging:

```bash
cd chromium
cp .env.production.example .env.production # fill Clerk production values
npm run package:store
```

`package:store` is the only release packaging command. It validates the
production endpoints and Clerk key, removes the pinned unpacked-development
key for store mode, runs WXT's zip command, and inspects the manifest inside
the resulting ZIP (audited permissions, `minimum_chrome_version`, numeric
version, no local URLs) before accepting it. Ordinary `dev`, `build`, and `zip`
commands keep the pinned key and stable unpacked ID.

Important production values:

- `WXT_WEB_APP_URL=https://bookmark.land` controls sign-in, dashboard,
  settings, and collection-note links.
- `WXT_CONVEX_URL=https://convex.bookmark.land` points at the production Convex
  deployment.
- `WXT_CLERK_SYNC_HOST=https://bookmark.land` is the production web origin the
  extension syncs Clerk sessions from.
- `WXT_CLERK_FRONTEND_API` and `WXT_CLERK_PUBLISHABLE_KEY` come from the Clerk
  production instance's Chrome Extension/API keys screen.

The WXT manifest also uses `WXT_WEB_APP_URL` as `homepage_url`, so a build fails
if the value is missing. If a locally loaded build still opens localhost, it was
built with the dev `.env`; rebuild after adding `chromium/.env.production`.

## Save entry points

The extension is capture-first: every save creates or updates a bookmark.land
bookmark and never writes to Chrome's native bookmark tree. The toolbar popup
uses a two-step Quick save flow: opening it checks whether the active page is
already in your library, and an unsaved page is only written after you click
**Add to bookmark.land**. The keyboard shortcut and context menus save
directly.

You can save from:

- The toolbar popup for the active web page, then **Add to bookmark.land**.
- The keyboard shortcut (`Ctrl+Shift+S` on Windows/Linux, `Command+Shift+S`
  on macOS) saves the active page immediately, then opens the popup for
  organizing on Chrome 127+. Users can rebind it at
  `chrome://extensions/shortcuts`.
- Right-click context menus on supported `http`/`https` pages and links:
  "Save to bookmark.land" for the current page and "Save link to
  bookmark.land" for a link target.

The manifest includes the `contextMenus` permission so the right-click save
entries can be registered. Context-menu saves run silently when you are signed
in; failures are surfaced in the popup for retry.

## Browser import

Signed-in users can start a browser bookmark import from the popup's
"Import browser bookmarks" button. The button opens a full-page preview wizard
that reads the native browser bookmark tree, lets users include or exclude
folders, choose the import destination, and then copies the selected bookmarks
into bookmark.land Collections.
The extension reads native bookmarks with the browser bookmarks permission and
calls the authenticated Convex action `api.importTree.importTree`; it never
writes back to the native bookmark tree.

The bookmark.land onboarding can start the same import for a new user. The web
app (the only origin in `externally_connectable`) sends the extension two
messages, and nothing else is answered:

| Message | Reply | Effect |
| --- | --- | --- |
| `{ type: "ping" }` | `{ version }` | Tells the web app the extension is installed. |
| `{ type: "open-import" }` | `{ ok: true }`, sent before the tab opens | Opens the import page in a new tab as `/import.html?return=<web app tab id>`. When `return` is present, the last screen's main button is **Back to setup**: it focuses that tab and closes the import tab (the library opens instead if that tab is gone). |

Extensions before 1.0.3 ignore `open-import` and send no reply, so the web app
does not wait for one.

The destination picker defaults to a top-level `Imported Bookmarks` Collection,
creating it if needed and reusing the active Collection on later imports.
Users can also import at the top level of their library, under an existing
Collection, or into a newly named top-level Collection.

The action accepts the structured tree payload produced by the extension:

```ts
{
  folders: Array<{
    key: string;
    name: string;
    parentKey?: string;
  }>;
  bookmarks: Array<{
    url: string;
    title?: string;
    folderKey?: string;
  }>;
  destination?:
    | { type: "root" }
    | { type: "create"; name: string }
    | { type: "collection"; id: Id<"collections"> };
}
```

`folders` must be ordered parents before children. `bookmarks` are submitted in
the browser tree's depth-first order, which is also the order used when account
capacity is consumed. Folder keys are request-local identifiers; bookmark
`folderKey` values point at those folders.

`destination` controls where the imported tree attaches. Omit it or pass
`{ type: "root" }` to import at the library root. Pass
`{ type: "create", name }` to create or reuse a top-level Collection by name, or
`{ type: "collection", id }` to import under an existing active Collection.
Top-level payload folders and bookmarks without a `folderKey` attach under the
resolved destination.

The server enforces defensive input bounds of 5,000 folders and 60,000
bookmarks per call. Collections can be nested up to five levels; the extension
preview should flatten deeper native folders before import, and the server
still enforces the collection depth limit. Unknown folder parents attach under
the resolved destination instead of failing the import.

The import can be re-run safely. Duplicate skipping is always enabled for
browser import, so active duplicate URLs are counted as duplicates and skipped,
while matching trashed bookmarks are restored. Only net-new bookmark inserts
consume account capacity; restored and duplicate bookmarks do not. If capacity
runs out, remaining net-new bookmarks are counted as skipped. The response
summarizes the run:

```ts
{
  total: number;
  imported: number;
  restored: number;
  duplicates: number;
  skipped: number;
  limit: number;
}
```

## Library panel

When you are signed in, the popup includes an "Open Library panel" button that
opens Chrome's side panel for bookmark.land. The panel lets you browse all
bookmarks or filter by collection without leaving the current tab. Collection
expansion state is shared with the web app sidebar, and bookmark rows open in
new tabs.

For Pro/Business accounts, selected collections show their note inline. Notes
can be viewed, added, and edited directly in the side panel with the same basic
rich-text schema as the web editor: bold, italic, headings, bullet/numbered
lists, checklists, and links. The full web editor remains available from the
"Open in web" / bookmark.land links for larger editing sessions.

The manifest includes the `sidePanel` permission so the popup can open and host
the Library panel.

## Saved-page indicator and editing

When you are signed in, the extension checks the active tab's web URL against
your bookmark.land library. Already-saved pages show a green box with a white
check on the toolbar icon. When a saved page's Site is flagged Vulnerable or
End-of-life, the badge is a red box with a white "!" instead (`utils/badge.ts`;
the Site lookup runs only for saved pages, whose Site is already in the
library). Unsupported pages and signed-out sessions keep the badge clear.
The badge updates on tab changes, URL changes, page load completion, and after
the popup saves or updates the page.

Opening the popup on a page that is already in your library does not create a
duplicate bookmark. The popup reports that the page is already saved and opens
the same organize controls for the existing bookmark, so collection, tag, and
favorite changes apply to the saved item.

## Site security label

The popup and the Library panel show the web app's Site security level
(Vulnerable, End-of-life, Possibly affected) for flagged Sites, through the
same `api.siteSecurity.flaggedSites` query as the web badge
(`components/site-risk.tsx`). The popup looks up the active page's Site when
it opens, saved or not; the panel looks up the Sites of the rows on screen.
Clicking a row's shield slides open a closable box under it with the level,
what it means, the software found and its known issues, and the last check,
from `api.siteSecurity.siteDetail` (loaded only while open; one box at a
time). The full explanation stays in the web app (`/help/site-security`).
Per [ADR-0002](../docs/adr/0002-site-security-passive-only.md) this only runs signed in.

## First run and uninstall

Installing opens `https://bookmark.land/extension/welcome` once (pin the
icon, sign in, how to save); uninstalling opens
`https://bookmark.land/extension/uninstalled`. Clerk's Solana wallet screen is replaced by a stub at
build time (`wxt.config.ts` alias, guarded by `utils/clerk-ui-stub.test.ts`)
so no unused Web3 code ships in the package.

## Privacy disclosure

The Chrome Web Store listing links to `https://bookmark.land/extension/privacy`,
which lists every permission, what
the extension sends to bookmark.land, and the store's Limited Use statement.
The popup footer repeats the one browsing-activity use (the saved-page badge
looks the active tab's URL up in the user's library). Any permission change
must update that page and the popup note too, so call it out in the pull request.

## Auth model

Signing into bookmark.land on the web signs the extension in automatically:
`ClerkProvider` is configured with the web app as sync host (`syncHost`),
and Convex queries authenticate with a Clerk JWT (template `convex`), the same
way the web app does. Signed out, the popup only
offers a sign-in button that opens the web app's sign-in page — no
credentials are ever entered in the extension.

Signed in, the popup header shows who is signed in, and the account button
(the user's initial) opens a menu with Account settings and Sign out. There
is no separate extension session, so Sign out ends the bookmark.land session
in this browser (website and extension together), and the menu says so.

Send feedback (popup footer and account menu) opens a small form that goes
through the same `productFeedback.submit` action as bookmark.land/feedback.
It sends the message, its type and the browser description tagged
`bookmark.land-extension/<version>`; never the address of the page you are on.

## Stable extension ID

The manifest pins a `key` (public key) in `wxt.config.ts`, so every
unpacked load gets the stable ID `kplnlpkpadnofifobjpbkhimpaldaghk`.
Clerk's instance `allowed_origins` must contain
`chrome-extension://kplnlpkpadnofifobjpbkhimpaldaghk` — without it Clerk
rejects requests from the extension. The Chrome Web Store assigns its own ID,
so `package:store` strips the `key` field from the store zip.
