import { useMemo } from "react";
import type { TreeNode } from "@/types";
import { aggregateTags, tagFontSize } from "./tag-cloud-data";

export function TagCloud({ tree }: { tree: TreeNode[] }) {
  const tags = useMemo(() => aggregateTags(tree), [tree]);
  const minimumCount = tags.at(-1)?.documentCount ?? 0;
  const maximumCount = tags[0]?.documentCount ?? 0;

  if (!tags.length) {
    return (
      <div role="status" className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        This vault has no tags to display.
      </div>
    );
  }

  return (
    <section aria-label="Tag word cloud" className="flex h-full min-h-0 items-center justify-center overflow-auto p-8">
      <ul className="flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-3" role="list">
        {tags.map((tag) => {
          const documentLabel = `${tag.documentCount} ${tag.documentCount === 1 ? "document" : "documents"}`;
          return (
            <li
              key={tag.label.toLowerCase()}
              data-testid="tag-cloud-tag"
              aria-label={`${tag.label}: ${documentLabel}`}
              className="text-foreground font-medium"
              style={{ fontSize: `${tagFontSize(tag.documentCount, minimumCount, maximumCount)}px` }}
            >
              {tag.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
