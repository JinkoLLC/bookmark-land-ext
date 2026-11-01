import type { GenericId } from "convex/values";

/**
 * The tables the extension refers to. Hand-written: the backend is private, so
 * these describe only what its public functions return to the extension.
 */
export type TableName = "bookmarks" | "collections" | "tags" | "trackedProducts";

export type Id<T extends TableName> = GenericId<T>;

export type Collection = {
  _id: Id<"collections">;
  _creationTime: number;
  userId: string;
  name: string;
  path: string;
  depth: number;
  order: number;
  bookmarkCount: number;
  isTrashed: boolean;
  icon?: string;
  color?: string;
  parentId?: Id<"collections">;
  notes?: string;
  shareToken?: string;
  shareSlug?: string;
  isExpanded?: boolean;
};

type Documents = { collections: Collection };

export type Doc<T extends keyof Documents> = Documents[T];
