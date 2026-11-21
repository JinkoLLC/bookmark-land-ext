import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useAuth } from "@clerk/chrome-extension";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "@convex/api";
import type { Doc, Id } from "@convex/dataModel";
import type { FunctionReturnType } from "convex/server";
import { browser } from "wxt/browser";
import { SIGN_IN_URL } from "@/utils/sign-in-url";
import { Globe } from "lucide-react";
import { buildTree, flattenTree, type TreeNode } from "../shared/tree";
import { derivePopupAuthState } from "@/utils/popup-state";
import { useStalled } from "@/hooks/use-stalled";
import { searchTermFor } from "@/utils/panel-search";
import { parseStoredHeight, TREE_HEIGHT_KEY } from "@/utils/panel-layout";
import { treeKeyAction, type TreeKeyItem } from "@/utils/tree-keys";
import {
  collectionMenuAt,
  CollectionRow,
  treeRowClass,
} from "@/components/collection-row";
import {
  CollectionContextMenu,
  type CollectionMenuState,
} from "@/components/collection-menu";
import { PanelDivider } from "@/components/panel-divider";
import { AuthStalled } from "@/components/auth-stalled";
import { LibraryErrorBoundary } from "@/components/library-error-boundary";
import { CollectionNotesPanel } from "@/components/collection-notes-panel";
import { AddPageButton } from "@/components/add-page-button";
import {
  SiteRiskDetails,
  SiteRiskToggle,
  useSiteRisks,
  type SiteRisk,
} from "@/components/site-risk";

const PAGE_SIZE = 25;

/**
 * The Library panel (browse): collection tree + Bookmark list rows, live.
 * Expansion state is the per-user Collection sidebar state, shared with the
 * web app. Scroll and selection reset when the panel reopens (fresh mount).
 */
export function LibraryPanel() {
  const { isLoaded, isSignedIn } = useAuth();
  const convexAuth = useConvexAuth();
  const waitingForAuth =
    !isLoaded || (isSignedIn === true && convexAuth.isLoading);
  const stalled = useStalled(waitingForAuth);
  const state = derivePopupAuthState({
    isLoaded,
    isSignedIn,
    stalled,
    convexAuth,
  });

  return (
    <main className="flex h-screen flex-col text-sm text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="sr-only">Library panel</h1>
      {state === "loading" && (
        <p className="p-4 text-neutral-500 dark:text-neutral-400">Loading…</p>
      )}
      {state === "stalled" && (
        <div className="p-4">
          <AuthStalled />
        </div>
      )}
      {state === "signed-out" && <SignedOutPanel />}
      {state === "signed-in" && (
        <LibraryErrorBoundary fallbackClassName="p-4">
          <PanelContent />
        </LibraryErrorBoundary>
      )}
    </main>
  );
}

function SignedOutPanel() {
  const openSignIn = () => {
    void browser.tabs.create({
      url: SIGN_IN_URL,
    });
  };
  return (
    <div className="flex flex-col gap-3 p-4">
      <p>Sign in to bookmark.land to browse your library.</p>
      <button
        type="button"
        onClick={openSignIn}
        className="self-start rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Sign in to bookmark.land
      </button>
    </div>
  );
}

function PanelContent() {
  // null = "All bookmarks"
  const [selected, setSelected] = useState<Id<"collections"> | null>(null);
  const [searchInput, setSearchInput] = useState("");
  // Deferred so fast typing doesn't fire a query per keystroke.
  const term = searchTermFor(useDeferredValue(searchInput));
  const results = useQuery(
    api.bookmarks.search,
    term === null ? "skip" : { query: term },
  );
  const data = useQuery(api.collections.listWithSidebarState);
  const subscription = useQuery(api.subscriptions.getSubscriptionInfo);
  const setExpanded = useMutation(api.collectionUiState.setExpanded);

  const canAddCollectionNotes = subscription
    ? subscription.storage.tier !== "free"
    : false;
  const tree = data ? buildTree(data.collections, data.sidebarState) : [];
  const selectedCollection = selected
    ? data?.collections.find((collection) => collection._id === selected)
    : null;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-neutral-200 p-2 dark:border-neutral-800">
        <AddPageButton />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search your library…"
          aria-label="Search your library"
          className="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-neutral-700 dark:placeholder:text-neutral-400"
        />
      </div>
      {/* Always mounted, so a search's outcome is announced while focus stays in the field.
          The visible count is this same element: it is read once. */}
      <p
        role="status"
        className={
          term === null
            ? "sr-only"
            : "px-4 pt-2 text-neutral-500 dark:text-neutral-400"
        }
      >
        {term === null
          ? ""
          : results === undefined
            ? "Searching…"
            : results.length === 0
              ? `No results for “${term}”.`
              : `${results.length} ${results.length === 1 ? "result" : "results"}`}
      </p>
      {term !== null ? (
        <SearchResults results={results ?? []} />
      ) : (
        <BrowseView
          tree={tree}
          loading={data === undefined}
          selected={selected}
          selectedCollection={selectedCollection}
          canAddCollectionNotes={canAddCollectionNotes}
          onSelect={setSelected}
          onToggle={(id, isExpanded) =>
            void setExpanded({ collectionId: id, isExpanded })
          }
        />
      )}
    </>
  );
}

function BrowseView({
  tree,
  loading,
  selected,
  selectedCollection,
  canAddCollectionNotes,
  onSelect,
  onToggle,
}: {
  tree: TreeNode[];
  loading: boolean;
  selected: Id<"collections"> | null;
  selectedCollection?: Doc<"collections"> | null;
  canAddCollectionNotes: boolean;
  onSelect: (id: Id<"collections"> | null) => void;
  onToggle: (id: Id<"collections">, isExpanded: boolean) => void;
}) {
  const treeRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // null = default (content-sized up to a limit); a number = user-chosen height.
  const [treeHeight, setTreeHeight] = useState<number | null>(() =>
    parseStoredHeight(localStorage.getItem(TREE_HEIGHT_KEY)),
  );
  const [menu, setMenu] = useState<CollectionMenuState | null>(null);
  const [hasBookmarks, setHasBookmarks] = useState(false);

  // The tree is one Tab stop: the row focused last, or "All bookmarks" (null)
  // when that row is no longer shown.
  const [focused, setFocused] = useState<Id<"collections"> | null>(null);
  const rows = flattenTree(tree);
  const tabStop = rows.some(({ node }) => node._id === focused) ? focused : null;
  const keyItems: TreeKeyItem[] = [
    { depth: 0, hasChildren: false, isExpanded: false }, // "All bookmarks"
    ...rows.map(({ node, depth }) => ({
      depth,
      hasChildren: node.children.length > 0,
      isExpanded: node.isExpanded,
    })),
  ];
  // Rows in display order; index 0 is "All bookmarks", index i is rows[i - 1].
  const rowElements = (treeElement: HTMLElement) => [
    ...treeElement.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ];

  const onTreeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const elements = rowElements(e.currentTarget);
    const action = treeKeyAction(
      e.key,
      e.shiftKey,
      keyItems,
      elements.indexOf(e.target as HTMLElement),
    );
    if (!action) return;
    const node = rows[action.index - 1]?.node;
    if (action.type === "focus") {
      elements[action.index].focus();
    } else if (action.type === "select") {
      onSelect(node?._id ?? null);
    } else if (!node) {
      return; // "All bookmarks" has no menu and nothing to expand
    } else if (action.type === "toggle") {
      onToggle(node._id, action.isExpanded);
    } else {
      const rect = elements[action.index].getBoundingClientRect();
      setMenu(collectionMenuAt(node, rect.left + 24, rect.bottom));
    }
    e.preventDefault();
  };

  return (
    <>
      <div
        ref={treeRef}
        style={
          treeHeight !== null
            ? { height: treeHeight, maxHeight: "80%", flex: "none" }
            : // Bookmarks to show: the tree takes what it needs, up to a third
              // of the panel and never more than 200 px.
              { maxHeight: hasBookmarks ? "min(33.333%, 200px)" : "45%" }
        }
        className="overflow-y-auto p-2"
      >
        <div
          role="tree"
          aria-label="Collections"
          onKeyDown={onTreeKeyDown}
          onFocus={(e) => {
            const index = rowElements(e.currentTarget).indexOf(e.target as HTMLElement);
            if (index >= 0) setFocused(rows[index - 1]?.node._id ?? null);
          }}
        >
          <div
            role="treeitem"
            aria-level={1}
            aria-selected={selected === null}
            tabIndex={tabStop === null ? 0 : -1}
            onClick={() => onSelect(null)}
            className={`${treeRowClass(selected === null)} px-2`}
          >
            All bookmarks
          </div>
          {!loading &&
            tree.map((node) => (
              <CollectionRow
                key={node._id}
                node={node}
                selected={selected}
                tabStop={tabStop}
                onSelect={onSelect}
                onToggle={onToggle}
                onMenu={setMenu}
              />
            ))}
        </div>
        {loading && (
          <p className="px-2 py-1 text-neutral-500 dark:text-neutral-400">
            Loading collections…
          </p>
        )}
      </div>
      <PanelDivider
        treeRef={treeRef}
        listRef={listRef}
        onResize={setTreeHeight}
        // Only "All bookmarks", or no bookmarks to make room for: nothing to resize.
        showButtons={rows.length > 0 && hasBookmarks}
      />
      <CollectionNotesPanel
        collection={selectedCollection}
        canAddNotes={canAddCollectionNotes}
      />
      <BookmarkList
        collectionId={selected ?? undefined}
        listRef={listRef}
        onHasRows={setHasBookmarks}
      />
      {menu && (
        <CollectionContextMenu
          key={menu.id}
          menu={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function SearchResults({
  results,
}: {
  results: FunctionReturnType<typeof api.bookmarks.search>;
}) {
  const risks = useSiteRisks(results.map((row) => row.domain));
  const [openRisk, setOpenRisk] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {results.map((row) => (
        <BookmarkRow
          key={row._id}
          row={row}
          risk={risks.get(row.domain)}
          riskOpen={openRisk === row._id}
          onRiskToggle={(open) => setOpenRisk(open ? row._id : null)}
        />
      ))}
    </div>
  );
}

function BookmarkList({
  collectionId,
  listRef,
  onHasRows,
}: {
  collectionId?: Id<"collections">;
  listRef: RefObject<HTMLDivElement | null>;
  /** Reports whether the open collection has bookmarks, once that is known. */
  onHasRows: (hasRows: boolean) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.bookmarks.list,
    { collectionId },
    { initialNumItems: PAGE_SIZE },
  );
  const risks = useSiteRisks(results.map((row) => row.domain));
  // One Site security box open at a time.
  const [openRisk, setOpenRisk] = useState<string | null>(null);

  // "Load more" was activated with this many rows shown, and still has focus.
  const loadingFrom = useRef<number | null>(null);
  useEffect(() => {
    const from = loadingFrom.current;
    if (from === null || results.length <= from) return;
    loadingFrom.current = null;
    // The button may be gone with the last page: focus goes to the first new row.
    listRef.current?.children[from]?.querySelector("button")?.focus();
  }, [results.length, listRef]);

  const hasRows = status === "LoadingFirstPage" ? null : results.length > 0;
  useEffect(() => {
    // Not while loading: the tree would jump on every collection switch.
    if (hasRows !== null) onHasRows(hasRows);
  }, [hasRows, onHasRows]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-2">
      {status === "LoadingFirstPage" && (
        <p className="px-2 text-neutral-500 dark:text-neutral-400">Loading bookmarks…</p>
      )}
      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="px-2 text-neutral-500 dark:text-neutral-400">No bookmarks here yet.</p>
      )}
      {results.map((row) => (
        <BookmarkRow
          key={row._id}
          row={row}
          risk={risks.get(row.domain)}
          riskOpen={openRisk === row._id}
          onRiskToggle={(open) => setOpenRisk(open ? row._id : null)}
        />
      ))}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        // Not natively disabled while loading: the button would drop focus.
        <button
          type="button"
          aria-disabled={status === "LoadingMore"}
          onClick={() => {
            if (status !== "CanLoadMore") return;
            loadingFrom.current = results.length;
            loadMore(PAGE_SIZE);
          }}
          onBlur={() => (loadingFrom.current = null)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:text-neutral-500 aria-disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800 dark:aria-disabled:text-neutral-400"
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

/** One Bookmark list row — used by both browse and search results. */
function BookmarkRow({
  row,
  risk,
  riskOpen = false,
  onRiskToggle,
}: {
  risk?: SiteRisk;
  riskOpen?: boolean;
  onRiskToggle?: (open: boolean) => void;
  row: {
    _id: string;
    url: string;
    title: string;
    domain: string;
    favicon?: string;
    isFavorite: boolean;
  };
}) {
  const detailsId = `site-risk-${row._id}`;
  return (
    <div>
      <div className="flex items-center gap-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800">
        <button
          type="button"
          onClick={() => void browser.tabs.create({ url: row.url })}
          className="group flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          // The title is cut to one line in the row: the tooltip has all of it, then the
          // address, and keyboard focus unwraps it in place.
          title={`${row.title}\n${row.url}`}
        >
          {row.favicon ? (
            <img src={row.favicon} alt="" className="h-4 w-4 shrink-0" />
          ) : (
            <Globe
              className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate group-focus-visible:whitespace-normal group-focus-visible:break-words">
              {row.title}
            </span>
            <span className="block truncate text-neutral-500 dark:text-neutral-400">{row.domain}</span>
          </span>
          {row.isFavorite && (
            // Positioned so the visually hidden text stays inside the row.
            <span className="relative">
              <span aria-hidden="true">★</span>
              <span className="sr-only">, favorite</span>
            </span>
          )}
        </button>
        {risk && (
          <SiteRiskToggle
            risk={risk}
            open={riskOpen}
            onToggle={() => onRiskToggle?.(!riskOpen)}
            detailsId={detailsId}
          />
        )}
      </div>
      {risk && riskOpen && (
        <SiteRiskDetails risk={risk} id={detailsId} onClose={() => onRiskToggle?.(false)} />
      )}
    </div>
  );
}
