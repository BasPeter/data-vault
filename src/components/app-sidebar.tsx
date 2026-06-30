import { Copy, FileText, Folder, FolderOpen } from "lucide-react";
import { AgentSkillsPanel } from "@/components/agent-skills-panel";
import { UpdateButton } from "@/components/update-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
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
  SidebarRail,
} from "@/components/ui/sidebar";
import type { TreeNode, VaultSummary } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  tree: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCopyPath: (id: string) => void;
  vaultName: string;
  vaults: VaultSummary[];
};

function TreeItems({
  nodes,
  activeId,
  onSelect,
  onCopyPath,
}: {
  nodes: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCopyPath: (id: string) => void;
}) {
  return (
    <SidebarMenu>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <Collapsible key={node.id} defaultOpen className="group/collapsible">
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
                  <TreeItems nodes={node.children} activeId={activeId} onSelect={onSelect} onCopyPath={onCopyPath} />
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ) : (
          <SidebarMenuItem key={node.id}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <SidebarMenuButton isActive={activeId === node.id} onClick={() => onSelect(node.id)}>
                  <FileText />
                  <span>{node.label}</span>
                </SidebarMenuButton>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onCopyPath(node.id)}>
                  <Copy />
                  Copy path
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </SidebarMenuItem>
        ),
      )}
    </SidebarMenu>
  );
}

export function AppSidebar({ tree, activeId, onSelect, onCopyPath, vaultName, vaults }: Props) {
  return (
    <Sidebar>
      <SidebarHeader
        className={cn("app-drag border-b py-3 pr-4", window.vaultApi.platform === "darwin" ? "pl-20" : "pl-4")}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <AppIcon className="size-8 shrink-0" />
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
            <TreeItems nodes={tree} activeId={activeId} onSelect={onSelect} onCopyPath={onCopyPath} />
          ) : (
            <p className="text-muted-foreground px-2 py-1 text-xs">No documents found.</p>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <AgentSkillsPanel vaults={vaults} />
        <UpdateButton showLabel />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AppIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 134 181" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M71.1091 179.134C68.4881 180.32 65.4832 180.319 62.8624 179.133L5.87592 153.335C2.29844 151.716 0 148.152 0 144.225V75.8409C0 72.4511 1.71726 69.2921 4.56204 67.4487L61.5488 30.5224C64.8566 28.379 69.1149 28.3786 72.4231 30.5213L129.436 67.4489C132.282 69.2921 134 72.4517 134 75.8422V144.224C134 148.152 131.701 151.715 128.123 153.335L71.1091 179.134ZM69.0583 174.057C67.7423 174.656 66.2315 174.656 64.9157 174.057L8.92832 148.568C7.14479 147.756 6 145.977 6 144.017V76.4505C6 74.7601 6.85404 73.1842 8.27024 72.2614L64.2577 35.7779C65.9167 34.6968 68.0573 34.6966 69.7164 35.7773L125.729 72.2615C127.146 73.1842 128 74.7604 128 76.4511V144.017C128 145.977 126.855 147.756 125.071 148.568L69.0583 174.057Z"
        fill="#585858"
      />
      <path
        className="fill-zinc-950 dark:fill-zinc-50"
        d="M36.2901 97.564L11.9641 133.492C11.2542 134.644 11.9871 136.142 13.3308 136.29L61.3282 141.376L36.2901 97.564ZM13.3953 120.696L30.7473 92.4983L13.0842 81.9014C12.4688 81.5326 11.6875 81.9751 11.6875 82.6919V120.215C11.6875 121.143 12.9067 121.489 13.3953 120.696ZM15.8936 145.626L60.6967 165.829C61.9182 166.394 63.3125 165.499 63.3125 164.156V149.021L16.4006 143.881C15.375 143.766 14.9648 145.17 15.8936 145.626ZM34.6122 86.2158L53.0336 53.2726C54.0338 51.6455 52.2062 49.7579 50.5492 50.7051L15.7922 73.4317C15.2229 73.805 15.2413 74.6439 15.8221 74.9942L34.6122 86.2158ZM92.1695 88.5619L70.1413 49.7556C69.4199 48.5848 68.21 47.9994 67 47.9994C65.7901 47.9994 64.5801 48.5848 63.8587 49.7556L41.8305 88.5619H92.1695ZM120.916 81.9014L103.253 92.5006L120.605 120.699C121.091 121.491 122.313 121.146 122.313 120.215V82.6919C122.313 81.9751 121.531 81.5326 120.916 81.9014ZM99.3878 86.2158L118.178 74.9919C118.761 74.6416 118.777 73.8027 118.208 73.4294L83.4509 50.7051C81.7938 49.7579 79.9662 51.6455 80.9664 53.2726L99.3878 86.2158ZM117.599 143.881L70.6875 149.019V164.153C70.6875 165.499 72.0819 166.391 73.3033 165.827L118.106 145.624C119.035 145.17 118.625 143.766 117.599 143.881ZM97.71 97.564L72.6742 141.376L120.672 136.29C122.015 136.14 122.748 134.644 122.038 133.492L97.71 97.564ZM43.854 95.9369L67 136.442L90.146 95.9369H43.854Z"
      />
      <rect width="134" height="10" rx="5" fill="#585858" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M122 3C123.657 3 125 4.34315 125 6V63C125 64.6569 123.657 66 122 66C120.343 66 119 64.6569 119 63V6C119 4.34315 120.343 3 122 3ZM12 5C13.6569 5 15 6.34315 15 8L15 65C15 66.6569 13.6569 68 12 68C10.3431 68 9 66.6569 9 65L9 8C9 6.34315 10.3431 5 12 5ZM32 5C33.6569 5 35 6.34315 35 8L35 52C35 53.6569 33.6569 55 32 55C30.3431 55 29 53.6569 29 52L29 8C29 6.34315 30.3431 5 32 5ZM52 5C53.6569 5 55 6.34315 55 8L55 38C55 39.6569 53.6569 41 52 41C50.3432 41 49 39.6569 49 38L49 8C49 6.34315 50.3431 5 52 5ZM82 5C83.6569 5 85 6.34315 85 8V38C85 39.6569 83.6569 41 82 41C80.3431 41 79 39.6569 79 38V8C79 6.34315 80.3431 5 82 5ZM102 5C103.657 5 105 6.34315 105 8V52C105 53.6569 103.657 55 102 55C100.343 55 99 53.6569 99 52V8C99 6.34315 100.343 5 102 5Z"
        fill="#585858"
      />
    </svg>
  );
}
