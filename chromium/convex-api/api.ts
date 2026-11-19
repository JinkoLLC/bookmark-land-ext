import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server";
import type { Collection, Id } from "./dataModel";

/**
 * The bookmark.land backend functions this extension calls, and only those.
 *
 * The backend lives in a private repo, so its generated API can't be imported
 * here. A signature that drifts from the backend fails at runtime, not at
 * compile time: when the backend changes one of these, update it here too.
 */
const query = <Args extends Record<string, unknown>, Result>(name: string) =>
  makeFunctionReference<"query", Args, Result>(name);
const mutation = <Args extends Record<string, unknown>, Result>(name: string) =>
  makeFunctionReference<"mutation", Args, Result>(name);
const action = <Args extends Record<string, unknown>, Result>(name: string) =>
  makeFunctionReference<"action", Args, Result>(name);

type BookmarkType = "link" | "article" | "image" | "video" | "document";
type LinkStatus = "unknown" | "ok" | "broken" | "checking";
type RiskLevel = "unknown" | "vulnerable" | "endOfLife" | "possiblyAffected" | "noKnownIssues";
type Plan = "free" | "pro" | "business";

type Bookmark = {
  _id: Id<"bookmarks">;
  _creationTime: number;
  url: string;
  title: string;
  domain: string;
  type: BookmarkType;
  tags: string[];
  isFavorite: boolean;
  coverImage?: string;
  savedAt?: number;
  description?: string;
  favicon?: string;
  collectionId?: Id<"collections">;
  linkStatus?: LinkStatus;
  lastCheckedAt?: number;
  httpStatusCode?: number;
  embeddable?: boolean;
  clickCount?: number;
};

type BookmarkDetail = Bookmark & { userId: string; note?: string; excerpt?: string };

type Tag = {
  _id: Id<"tags">;
  _creationTime: number;
  userId: string;
  name: string;
  path: string;
  count: number;
  color?: string;
  parentId?: Id<"tags">;
};

type SiteDetail = {
  site: string;
  riskLevel: RiskLevel;
  lastScannedAt?: number;
  scanOutcome?: "failed" | "ok" | "blocked";
  detectedSoftware: { productId: Id<"trackedProducts">; product: string; version: string }[];
  findings: {
    productId: Id<"trackedProducts">;
    product: string;
    version: string;
    level: "vulnerable" | "endOfLife" | "possiblyAffected";
    cycle?: string;
    eolDate?: string;
    cveId?: string;
    cvss?: number;
    kev?: boolean;
  }[];
};

type SubscriptionInfo = {
  plan: Plan;
  status: "none" | "active" | "canceled" | "past_due";
  bookmarkCount: number;
  trashedCount: number;
  limit: number;
  storage: { usedBytes: number; limit: number; maxFileBytes: number; tier: Plan };
};

/** A collection that live pages show, with those pages. */
type CollectionFeed = {
  collectionId: Id<"collections">;
  pages: { pageId: string; path: string; visibility: "public" | "unlisted" | "password" }[];
};

type ShortLink = {
  shortUrl: string;
  targetUrl: string;
  status: "active" | "blocked";
  userPaused: boolean;
  lapsePaused?: boolean;
};

type ShortLinkUsage = {
  tier: "free" | "edu" | "pro" | "business";
  created: number;
  monthly: number;
  liveCap?: number;
  held?: number;
  resetsAt: number;
  available: boolean;
};

type ImportDestination = { type: "root" } | { type: "create"; name: string } | { type: "collection"; id: Id<"collections"> };

export const api = {
  bookmarkMutations: {
    create: mutation<
      {
        url: string;
        title?: string;
        description?: string;
        collectionId?: Id<"collections">;
        tags?: string[];
        type?: BookmarkType;
        note?: string;
        isFavorite?: boolean;
        skipDuplicates?: boolean;
        expectedUserId?: string;
      },
      | { duplicate: false; restored: true; bookmarkId: Id<"bookmarks">; existingTitle: string }
      | { duplicate: boolean; bookmarkId: Id<"bookmarks">; restored?: undefined; existingTitle?: undefined }
    >("bookmarkMutations:create"),
    moveToCollection: mutation<{ id: Id<"bookmarks">; collectionId?: Id<"collections"> }, null>(
      "bookmarkMutations:moveToCollection",
    ),
    toggleFavorite: mutation<{ id: Id<"bookmarks"> }, null>("bookmarkMutations:toggleFavorite"),
  },
  bookmarkTags: {
    addTagToBookmark: mutation<{ bookmarkId: Id<"bookmarks">; tagName: string }, Id<"tags">>(
      "bookmarkTags:addTagToBookmark",
    ),
    getTagsForBookmark: query<{ bookmarkId: Id<"bookmarks"> }, Tag[]>("bookmarkTags:getTagsForBookmark"),
    removeTagFromBookmark: mutation<{ bookmarkId: Id<"bookmarks">; tagId: Id<"tags"> }, null>(
      "bookmarkTags:removeTagFromBookmark",
    ),
  },
  bookmarks: {
    findSavedByUrl: query<{ url: string }, { bookmarkId: Id<"bookmarks">; title: string } | null>(
      "bookmarks:findSavedByUrl",
    ),
    get: query<{ id: Id<"bookmarks"> }, BookmarkDetail | null>("bookmarks:get"),
    list: query<
      {
        paginationOpts: PaginationOptions;
        collectionId?: Id<"collections">;
        sortBy?: "title" | "domain" | "newest" | "oldest" | "most-visited" | "least-visited";
      },
      PaginationResult<Bookmark>
    >("bookmarks:list"),
    search: query<
      { query: string; collectionId?: Id<"collections">; collectionIds?: Id<"collections">[]; titleOnly?: boolean },
      Bookmark[]
    >("bookmarks:search"),
  },
  collectionMutations: {
    update: mutation<
      { id: Id<"collections">; name?: string; icon?: string; color?: string; notes?: string },
      Id<"collections">
    >("collectionMutations:update"),
  },
  collectionUiState: {
    setExpanded: mutation<{ collectionId: Id<"collections">; isExpanded: boolean }, null>(
      "collectionUiState:setExpanded",
    ),
  },
  collections: {
    list: query<Record<string, never>, Collection[]>("collections:list"),
    listWithSidebarState: query<
      Record<string, never>,
      { collections: Collection[]; sidebarState: Record<string, boolean> }
    >("collections:listWithSidebarState"),
  },
  importTree: {
    importTree: action<
      {
        bookmarks: { url: string; title?: string; folderKey?: string }[];
        folders: { key: string; name: string; parentKey?: string }[];
        destination?: ImportDestination;
      },
      {
        total: number;
        imported: number;
        restored: number;
        duplicates: number;
        skipped: number;
        limit: number;
        destinationId?: Id<"collections">;
        collections: { id: Id<"collections">; name: string }[];
      }
    >("importTree:importTree"),
  },
  productFeedback: {
    submit: action<
      {
        message: string;
        triageType: string;
        acknowledgementAccepted: boolean;
        currentPageUrl?: string;
        userAgent?: string;
      },
      { ok: true }
    >("productFeedback:submit"),
  },
  shortLinks: {
    // Newest first; `truncated` when the account has more than the newest 1,000.
    list: query<Record<string, never>, { links: ShortLink[]; truncated: boolean }>("shortLinks:list"),
    usage: query<Record<string, never>, ShortLinkUsage>("shortLinks:usage"),
    // The server stores `targetUrl` as `new URL(targetUrl).href`.
    create: mutation<{ targetUrl: string; bookmarkId?: Id<"bookmarks"> }, { shortUrl: string }>(
      "shortLinks:create",
    ),
  },
  siteSecurity: {
    flaggedSites: query<{ sites: string[] }, { site: string; riskLevel: RiskLevel; findingCount: number }[]>(
      "siteSecurity:flaggedSites",
    ),
    siteDetail: query<{ site: string }, SiteDetail | null>("siteSecurity:siteDetail"),
  },
  subscriptions: {
    getSubscriptionInfo: query<Record<string, never>, SubscriptionInfo>("subscriptions:getSubscriptionInfo"),
  },
  tags: {
    list: query<Record<string, never>, Tag[]>("tags:list"),
  },
  userPages: {
    collectionFeeds: query<Record<string, never>, CollectionFeed[]>("userPages:collectionFeeds"),
  },
};
