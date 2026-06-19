import { FileText, Folder, FolderOpen } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import type { TreeNode } from "@/types";

type Props = {
  tree: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  vaultName: string;
};

function TreeItems({
  nodes,
  activeId,
  onSelect,
}: {
  nodes: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <SidebarMenu>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <Collapsible
            key={node.id}
            defaultOpen
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton>
                  <Folder className="group-data-[state=open]/collapsible:hidden" />
                  <FolderOpen className="hidden group-data-[state=open]/collapsible:block" />
                  <span>{node.label}</span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <TreeItems
                    nodes={node.children}
                    activeId={activeId}
                    onSelect={onSelect}
                  />
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ) : (
          <SidebarMenuItem key={node.id}>
            <SidebarMenuButton
              isActive={activeId === node.id}
              onClick={() => onSelect(node.id)}
            >
              <FileText />
              <span>{node.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ),
      )}
    </SidebarMenu>
  );
}

export function AppSidebar({ tree, activeId, onSelect, vaultName }: Props) {
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="truncate text-sm font-semibold">{vaultName}</span>
          <span className="text-muted-foreground text-xs">Data Vault</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Documents</SidebarGroupLabel>
          {tree.length ? (
            <TreeItems nodes={tree} activeId={activeId} onSelect={onSelect} />
          ) : (
            <p className="text-muted-foreground px-2 py-1 text-xs">
              No documents found.
            </p>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
