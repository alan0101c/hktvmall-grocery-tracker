/**
 * Helpers for the category naming convention:
 *   [Category] / [Product Type] / [Product Name]
 * e.g. "Baby / Shampoo / Mustela Gentle Shampoo".
 *
 * The hierarchy is derived purely from product_types.name in the frontend —
 * the database stores only the flat string. Names with 1 or 2 segments still work.
 */

/** Split a category name into its trimmed, non-empty path segments. */
export function parseTypeName(name: string): string[] {
  return name
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Join path segments back into the canonical "A / B / C" form. */
export function joinTypeName(parts: string[]): string {
  return parts.join(" / ");
}

/** Display label for a name: its last segment. */
export function leafSegment(name: string): string {
  const parts = parseTypeName(name);
  return parts[parts.length - 1] ?? name.trim();
}

export interface TreeLeaf<T> {
  kind: "leaf";
  /** Last path segment — the display label. */
  segment: string;
  item: T;
}

export interface TreeBranch<T> {
  kind: "branch";
  /** This level's segment — the display label. */
  segment: string;
  /** Full path from the root to this branch. */
  prefix: string[];
  children: TreeNode<T>[];
}

export type TreeNode<T> = TreeBranch<T> | TreeLeaf<T>;

/**
 * Build an ordered tree from flat items. A name with N segments becomes a leaf
 * at depth N-1; longer names share branch nodes for their common prefixes.
 * First-appearance order is preserved, and a prefix that is both a leaf and a
 * branch (e.g. "Drinks" alongside "Drinks / Coke") renders the leaf first.
 */
export function buildCategoryTree<T>(items: T[], getName: (t: T) => string): TreeNode<T>[] {
  interface Entry {
    parts: string[];
    item: T;
  }

  function build(level: number, prefix: string[], entries: Entry[]): TreeNode<T>[] {
    const nodes: TreeNode<T>[] = [];
    const branches = new Map<string, { branch: TreeBranch<T>; entries: Entry[] }>();

    for (const e of entries) {
      if (e.parts.length <= level + 1) {
        nodes.push({ kind: "leaf", segment: e.parts[e.parts.length - 1] ?? "", item: e.item });
        continue;
      }
      const seg = e.parts[level];
      let b = branches.get(seg);
      if (!b) {
        b = {
          branch: { kind: "branch", segment: seg, prefix: [...prefix, seg], children: [] },
          entries: [],
        };
        branches.set(seg, b);
        nodes.push(b.branch);
      }
      b.entries.push(e);
    }

    for (const { branch, entries: sub } of branches.values()) {
      branch.children = build(level + 1, branch.prefix, sub);
    }
    return nodes;
  }

  return build(0, [], items.map((item) => ({ parts: parseTypeName(getName(item)), item })));
}

/** Every leaf item under a node (the item itself when the node is a leaf). */
export function flattenLeaves<T>(node: TreeNode<T>): T[] {
  return node.kind === "leaf" ? [node.item] : node.children.flatMap(flattenLeaves);
}

/** Stable key for a branch, used for collapse state. */
export function branchKey(prefix: string[]): string {
  return prefix.join(" / ");
}
