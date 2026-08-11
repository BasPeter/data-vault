import type { TreeNode } from "@/types";

export type TagCloudEntry = { label: string; documentCount: number };

export const TAG_CLOUD_MIN_FONT_SIZE = 16;
export const TAG_CLOUD_MAX_FONT_SIZE = 40;

export function aggregateTags(tree: TreeNode[]): TagCloudEntry[] {
  const entries = new Map<string, TagCloudEntry>();

  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        visit(node.children);
        continue;
      }

      const documentTags = new Set<string>();
      for (const tag of node.tags) {
        const label = tag.trim();
        const normalized = label.toLowerCase();
        if (!normalized || documentTags.has(normalized)) continue;
        documentTags.add(normalized);
        const entry = entries.get(normalized);
        if (entry) entry.documentCount += 1;
        else entries.set(normalized, { label, documentCount: 1 });
      }
    }
  };

  visit(tree);
  return [...entries.values()].sort((left, right) => {
    if (left.documentCount !== right.documentCount) return right.documentCount - left.documentCount;
    const leftLabel = left.label.toLowerCase();
    const rightLabel = right.label.toLowerCase();
    if (leftLabel !== rightLabel) return leftLabel < rightLabel ? -1 : 1;
    return left.label === right.label ? 0 : left.label < right.label ? -1 : 1;
  });
}

export function tagFontSize(count: number, minimumCount: number, maximumCount: number): number {
  if (minimumCount === maximumCount) return (TAG_CLOUD_MIN_FONT_SIZE + TAG_CLOUD_MAX_FONT_SIZE) / 2;
  const size =
    TAG_CLOUD_MIN_FONT_SIZE +
    ((count - minimumCount) / (maximumCount - minimumCount)) * (TAG_CLOUD_MAX_FONT_SIZE - TAG_CLOUD_MIN_FONT_SIZE);
  return Math.min(TAG_CLOUD_MAX_FONT_SIZE, Math.max(TAG_CLOUD_MIN_FONT_SIZE, size));
}
