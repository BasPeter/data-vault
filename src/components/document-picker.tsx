import { FileText, Folder, FolderOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { TreeNode } from "@/types";

type Props = {
  tree: TreeNode[];
  onSelect: (id: string) => void;
};

export function DocumentPicker({ tree, onSelect }: Props) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Open a document</h1>
        <p className="text-muted-foreground mt-1 text-sm">Choose a document from this vault.</p>
      </div>
      {tree.length ? (
        <div className="min-h-0 overflow-auto rounded-md border">
          <DocumentPickerItems nodes={tree} onSelect={onSelect} level={0} />
        </div>
      ) : (
        <div className="text-muted-foreground flex min-h-48 items-center justify-center rounded-md border text-sm">
          No documents found.
        </div>
      )}
    </div>
  );
}

function DocumentPickerItems({
  nodes,
  onSelect,
  level,
}: {
  nodes: TreeNode[];
  onSelect: (id: string) => void;
  level: number;
}) {
  return (
    <div className="py-1">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <Collapsible key={node.id} defaultOpen className="group/collapsible">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                title={node.description}
                className="h-8 w-full justify-start rounded-none px-3 text-sm font-normal"
                style={{ paddingLeft: `${0.75 + level * 1.25}rem` }}
              >
                <Folder className="group-data-[state=open]/collapsible:hidden" />
                <FolderOpen className="hidden group-data-[state=open]/collapsible:block" />
                <span className="truncate">{node.label}</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <DocumentPickerItems nodes={node.children} onSelect={onSelect} level={level + 1} />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Button
            key={node.id}
            type="button"
            variant="ghost"
            className="h-8 w-full justify-start rounded-none px-3 text-sm font-normal"
            style={{ paddingLeft: `${0.75 + level * 1.25}rem` }}
            onClick={() => onSelect(node.id)}
          >
            <FileText />
            <span className="truncate">{node.label}</span>
          </Button>
        ),
      )}
    </div>
  );
}
