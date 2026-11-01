# bookmark.land browser extensions

The browser extensions that save pages to bookmark.land and show a user's library in the browser.

## Language

### Library

**Bookmark**:
A saved URL in a user's library, with its title, description, note, tags and collection.
_Avoid_: Link, item, entry

**Collection**:
A named group of bookmarks that can be nested up to five levels. Names are not unique.
_Avoid_: Folder, list, category

**Unsorted**:
Where a bookmark lives when it belongs to no collection.
_Avoid_: Inbox, uncategorized, root

**Tag**:
A lowercase label attached to bookmarks; names are case-insensitive and may use `/` for hierarchy.
_Avoid_: Label, keyword

**Smart folder**:
A saved set of rules that matches bookmarks; it holds no bookmarks of its own.
_Avoid_: Saved search, filter, view

### Removal

**Trash**:
Where removed bookmarks and collections wait for 30 days before they are permanently deleted.
_Avoid_: Bin, recycle bin, archive

**Remove**:
Move a bookmark or collection to the Trash. Reversible with Restore.
_Avoid_: Delete (for this meaning), trash (as a verb)

**Restore**:
Take a bookmark or collection back out of the Trash.
_Avoid_: Undelete, recover

**Permanently delete**:
Erase a bookmark for good. Not reversible, and requires the `destructive` scope.
_Avoid_: Delete (unqualified), purge, destroy

### Extension

**Quick save**:
Saving the current page with one click, the keyboard shortcut or the right-click menu.
_Avoid_: Clip, capture (as a verb)

**Library panel**:
The browser's side panel showing the user's Collections and Bookmarks.
_Avoid_: Sidebar, drawer

**Browser import**:
A one-time, read-only copy of the browser's native bookmarks into bookmark.land. The extension never writes to the native bookmarks.
_Avoid_: Sync

**Site security label**:
The level (Vulnerable, End-of-life, Possibly affected) the web app reports for a flagged Site.
_Avoid_: Risk score, safety rating

**Site**:
A bookmark's domain, as Site security sees it.
_Avoid_: Domain (in user-facing text), host
