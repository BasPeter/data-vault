// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TreeNode } from "@/types";
import { TagCloud } from "./tag-cloud";
import { aggregateTags, tagFontSize } from "./tag-cloud-data";

const tree: TreeNode[] = [
  { type: "doc", id: "first", label: "First", date: null, tags: ["Azure", " azure ", "Security", ""] },
  {
    type: "folder",
    id: "folder",
    label: "Folder",
    children: [{ type: "doc", id: "second", label: "Second", date: null, tags: ["AZURE", "Platform"] }],
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("aggregateTags", () => {
  it("counts each normalized tag once per document and preserves the first trimmed spelling", () => {
    expect(aggregateTags(tree)).toEqual([
      { label: "Azure", documentCount: 2 },
      { label: "Platform", documentCount: 1 },
      { label: "Security", documentCount: 1 },
    ]);
  });

  it("ignores empty tags and orders equal frequencies deterministically", () => {
    expect(
      aggregateTags([{ type: "doc", id: "empty", label: "Empty", date: null, tags: [" ", "Beta", "alpha"] }]),
    ).toEqual([
      { label: "alpha", documentCount: 1 },
      { label: "Beta", documentCount: 1 },
    ]);
  });
});

describe("tagFontSize", () => {
  it("uses bounded endpoints and a shared middle size for equal frequencies", () => {
    expect(tagFontSize(1, 1, 5)).toBe(16);
    expect(tagFontSize(5, 1, 5)).toBe(40);
    expect(tagFontSize(3, 3, 3)).toBe(28);
  });
});

describe("TagCloud", () => {
  it("renders readable document counts and larger sizes for more frequently used tags", async () => {
    await act(async () => root.render(<TagCloud tree={tree} />));

    const azure = container.querySelector<HTMLElement>('[aria-label="Azure: 2 documents"]')!;
    const security = container.querySelector<HTMLElement>('[aria-label="Security: 1 document"]')!;
    expect(azure).not.toBeNull();
    expect(security).not.toBeNull();
    expect(Number.parseFloat(azure.style.fontSize)).toBeGreaterThan(Number.parseFloat(security.style.fontSize));
  });

  it("renders equal-frequency tags at the same size and provides an explicit empty state", async () => {
    await act(async () =>
      root.render(<TagCloud tree={[{ type: "doc", id: "one", label: "One", date: null, tags: ["Alpha", "Beta"] }]} />),
    );
    const tags = [...container.querySelectorAll<HTMLElement>("[data-testid=tag-cloud-tag]")];
    expect(tags.map((tag) => tag.style.fontSize)).toEqual(["28px", "28px"]);

    await act(async () =>
      root.render(<TagCloud tree={[{ type: "doc", id: "none", label: "None", date: null, tags: [" "] }]} />),
    );
    expect(container.querySelector("[role=status]")?.textContent).toBe("This vault has no tags to display.");
  });
});
