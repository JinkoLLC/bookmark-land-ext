import type { Doc, Id } from "@convex/dataModel";

export interface TreeNode {
  _id: Id<"collections">;
  name: string;
  icon?: string;
  color?: string;
  parentId?: Id<"collections">;
  path: string;
  depth: number;
  order: number;
  isExpanded: boolean;
  notes?: string;
  bookmarkCount: number;
  shareToken?: string;
  shareSlug?: string;
  userId: string;
  children: TreeNode[];
}

export function buildTree(
  items: Doc<"collections">[],
  expandedMap?: Record<string, boolean>,
): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  for (const item of items) {
    map.set(item._id, {
      ...item,
      isExpanded: expandedMap?.[item._id] ?? false,
      children: [],
    });
  }

  // Build hierarchy
  for (const item of items) {
    const node = map.get(item._id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by order
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };
  sortChildren(roots);

  return roots;
}

export interface FlatNode {
  node: TreeNode;
  depth: number;
}

export function flattenTree(nodes: TreeNode[]): FlatNode[] {
  const result: FlatNode[] = [];

  const walk = (list: TreeNode[], depth: number) => {
    for (const node of list) {
      result.push({ node, depth });
      if (node.isExpanded && node.children.length > 0) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(nodes, 0);
  return result;
}
