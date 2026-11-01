import { useDeferredValue, useRef, useState, type RefObject } from "react";
import { useAuth } from "@clerk/chrome-extension";
import {
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "@convex/api";
import type { Doc, Id } from "@convex/dataModel";
import { browser } from "wxt/browser";
import { buildTree, type TreeNode } from "../shared/tree";
import { derivePopupAuthState } from "@/utils/popup-state";
import { useStalled } from "@/hooks/use-stalled";
import { searchTermFor } from "@/utils/panel-search";
import { parseStoredHeight, TREE_HEIGHT_KEY } from "@/utils/panel-layout";
import { CollectionRow } from "@/components/collection-row";
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
    <div className="flex h-screen flex-col text-sm text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      {state === "loading" && (
        <p className="p-4 text-neutral-500">Loading…</p>
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
    </div>
  );
}

function SignedOutPanel() {
  const openSignIn = () => {
    void browser.tabs.create({
      url: `${import.meta.env.WXT_WEB_APP_URL}/sign-in`,
    });
  };
  return (
    <div className="flex flex-col gap-3 p-4">
      <p>Sign in to bookmark.land to browse your library.</p>
      <button
        type="button"
        onClick={openSignIn}
        className="self-start rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
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
          className="w-full rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-ring dark:border-neutral-700"
        />
      </div>
      {term !== null ? (
        <SearchResults term={term} />
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
  const treeRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // null = default (content-sized up to 45%); a number = user-chosen height.
  const [treeHeight, setTreeHeight] = useState<number | null>(() =>
    parseStoredHeight(localStorage.getItem(TREE_HEIGHT_KEY)),
  );
  const [menu, setMenu] = useState<CollectionMenuState | null>(null);

  return (
    <>
      <nav
        ref={treeRef}
        style={
          treeHeight === null
            ? { maxHeight: "45%" }
            : { height: treeHeight, maxHeight: "80%", flex: "none" }
        }
        className="overflow-y-auto p-2"
      >
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`block w-full rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${selected === null ? "bg-neutral-100 font-medium dark:bg-neutral-800" : ""}`}
        >
          All bookmarks
        </button>
        {loading ? (
          <p className="px-2 py-1 text-neutral-500">Loading collections…</p>
        ) : (
          tree.map((node) => (
            <CollectionRow
              key={node._id}
              node={node}
              selected={selected}
              onSelect={onSelect}
              onToggle={onToggle}
              onMenu={setMenu}
            />
          ))
        )}
      </nav>
      <PanelDivider treeRef={treeRef} listRef={listRef} onResize={setTreeHeight} />
      <CollectionNotesPanel
        collection={selectedCollection}
        canAddNotes={canAddCollectionNotes}
      />
      <BookmarkList collectionId={selected ?? undefined} listRef={listRef} />
      {menu && (
        <CollectionContextMenu menu={menu} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

function SearchResults({ term }: { term: string }) {
  const results = useQuery(api.bookmarks.search, { query: term });
  const risks = useSiteRisks((results ?? []).map((row) => row.domain));
  const [openRisk, setOpenRisk] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {results === undefined && (
        <p className="px-2 text-neutral-500">Searching…</p>
      )}
      {results !== undefined && results.length === 0 && (
        <p className="px-2 text-neutral-500">No results for “{term}”.</p>
      )}
      {(results ?? []).map((row) => (
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
}: {
  collectionId?: Id<"collections">;
  listRef?: RefObject<HTMLDivElement | null>;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.bookmarks.list,
    { collectionId },
    { initialNumItems: PAGE_SIZE },
  );
  const risks = useSiteRisks(results.map((row) => row.domain));
  // One Site security box open at a time.
  const [openRisk, setOpenRisk] = useState<string | null>(null);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-2">
      {status === "LoadingFirstPage" && (
        <p className="px-2 text-neutral-500">Loading bookmarks…</p>
      )}
      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="px-2 text-neutral-500">No bookmarks here yet.</p>
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
      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_SIZE)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Load more
        </button>
      )}
      {status === "LoadingMore" && (
        <p className="px-2 py-1 text-neutral-500">Loading…</p>
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
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
          title={row.url}
        >
          {row.favicon ? (
            <img src={row.favicon} alt="" className="h-4 w-4 shrink-0" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{row.title}</span>
            <span className="block truncate text-neutral-500">{row.domain}</span>
          </span>
          {row.isFavorite && <span aria-label="Favorite">★</span>}
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
