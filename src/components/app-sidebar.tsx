import { FileText, Folder, FolderOpen } from "lucide-react";
import { AgentSkillsPanel } from "@/components/agent-skills-panel";
import { UpdateButton } from "@/components/update-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import type { TreeNode, VaultSummary } from "@/types";
import { cn } from "@/lib/utils";
import appIcon from "../../build/icon.svg";

type Props = {
  tree: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  vaultName: string;
  vaults: VaultSummary[];
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
                <SidebarMenuButton title={node.description}>
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

export function AppSidebar({ tree, activeId, onSelect, vaultName, vaults }: Props) {
  return (
    <Sidebar>
      <SidebarHeader
        className={cn(
          "app-drag border-b py-3 pr-4",
          window.vaultApi.platform === "darwin" ? "pl-20" : "pl-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={appIcon} alt="" className="size-8 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{vaultName}</span>
            <span className="text-muted-foreground text-xs">Data Vault</span>
          </div>
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
      <SidebarFooter className="border-t">
        <AgentSkillsPanel vaults={vaults} />
        <UpdateButton showLabel />
      </SidebarFooter>
    </Sidebar>
  );
}
