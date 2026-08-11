import {
  BarChart3,
  CheckCircle2,
  Compass,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgentSkillsPanel } from "@/components/agent-skills-panel";
import { UpdateButton } from "@/components/update-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { DashboardListEntry, DashboardManifest } from "@/dashboard-contracts";
import type { DocNode, TreeNode, VaultSummary } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  tree: TreeNode[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCopyPath: (id: string) => void;
  vaultName: string;
  vaults: VaultSummary[];
  dashboards: DashboardListEntry[];
  activeDashboardId: string | null;
  onSelectDashboard: (id: string) => void;
  onCreateDashboard: () => void;
  onRenameDashboard: (dashboard: DashboardManifest) => void;
  onMoveDashboard: (dashboardId: string, direction: -1 | 1) => void;
  onRemoveDashboard: (dashboard: DashboardManifest) => void;
  onRelocateDashboard: (dashboard: DashboardListEntry) => void;
  onManageSecrets: () => void;
};

const dashboardIcons = {
  chart: BarChart3,
  check: CheckCircle2,
  compass: Compass,
  lightbulb: Lightbulb,
  target: Target,
} as const;
const dashboardColors = {
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
} as const;

type IndexedDoc = {
  doc: DocNode;
  path: string[];
  index: number;
  normalizedTags: string[];
};

type SearchResult = IndexedDoc & { score: number; matchedTags: string[] };

function createSearchIndex(tree: TreeNode[]) {
  const documents: IndexedDoc[] = [];
  const suggestions: string[] = [];
  const knownSuggestions = new Set<string>();

  const visit = (nodes: TreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        visit(node.children, [...path, node.label]);
        continue;
      }

      const normalizedTags = [...new Set(node.tags.map((tag) => tag.toLowerCase()))];
      documents.push({ doc: node, path, index: documents.length, normalizedTags });
      for (const tag of node.tags) {
        const normalizedTag = tag.toLowerCase();
        if (!knownSuggestions.has(normalizedTag)) {
          knownSuggestions.add(normalizedTag);
          suggestions.push(tag);
        }
      }
    }
  };

  visit(tree, []);
  return { documents, suggestions };
}

function uniqueTokens(tokens: string[]) {
  const seen = new Set<string>();
  return tokens.flatMap((token) => {
    const normalizedToken = token.trim().toLowerCase();
    if (!normalizedToken || seen.has(normalizedToken)) return [];
    seen.add(normalizedToken);
    return [normalizedToken];
  });
}

function addTokens(tokens: string[], value: string) {
  const knownTokens = new Set(tokens.map((token) => token.toLowerCase()));
  return value.split(",").reduce((nextTokens, fragment) => {
    const token = fragment.trim();
    const normalizedToken = token.toLowerCase();
    if (!token || knownTokens.has(normalizedToken)) return nextTokens;
    knownTokens.add(normalizedToken);
    return [...nextTokens, token];
  }, tokens);
}

function scoreResults(index: IndexedDoc[], tokens: string[]): SearchResult[] {
  const queryTokens = uniqueTokens(tokens);
  return index
    .flatMap((entry) => {
      const score = queryTokens.filter((token) => entry.normalizedTags.some((tag) => tag.includes(token))).length;
      if (!score) return [];
      const matchedTags = entry.doc.tags.filter((tag, position) => {
        const normalizedTag = tag.toLowerCase();
        return (
          entry.doc.tags.findIndex((candidate) => candidate.toLowerCase() === normalizedTag) === position &&
          queryTokens.some((token) => normalizedTag.includes(token))
        );
      });
      return [{ ...entry, score, matchedTags }];
    })
    .sort((left, right) => {
      const leftFullMatch = left.score === queryTokens.length;
      const rightFullMatch = right.score === queryTokens.length;
      if (leftFullMatch !== rightFullMatch) return leftFullMatch ? -1 : 1;
      if (!leftFullMatch && left.score !== right.score) return right.score - left.score;
      return left.index - right.index;
    });
}

function SidebarTagSearch({
  tokens,
  input,
  suggestions,
  highlightedIndex,
  onInputChange,
  onInputKeyDown,
  onPaste,
  onRemoveToken,
  onSelectSuggestion,
}: {
  tokens: string[];
  input: string;
  suggestions: string[];
  highlightedIndex: number | null;
  onInputChange: (value: string) => void;
  onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onPaste: React.ClipboardEventHandler<HTMLInputElement>;
  onRemoveToken: (token: string) => void;
  onSelectSuggestion: (suggestion: string) => void;
}) {
  const { state } = useSidebar();

  if (state === "collapsed") return null;

  return (
    <div className="app-no-drag rounded-md border bg-transparent p-1">
      <div className="relative">
        <SidebarInput
          className="w-full border-0 bg-black text-white placeholder:text-white focus-visible:border-0 focus-visible:ring-0"
          aria-label="Search document tags"
          aria-autocomplete="list"
          aria-controls="sidebar-tag-suggestions"
          aria-expanded={suggestions.length > 0}
          aria-activedescendant={highlightedIndex === null ? undefined : `sidebar-tag-suggestion-${highlightedIndex}`}
          placeholder="Search"
          role="combobox"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          onPaste={onPaste}
        />
        {suggestions.length > 0 && (
          <div
            id="sidebar-tag-suggestions"
            role="listbox"
            className="absolute left-0 top-full z-10 mt-1 w-full rounded border bg-popover p-1"
          >
            {suggestions.map((suggestion, index) => (
              <button
                id={`sidebar-tag-suggestion-${index}`}
                key={suggestion.toLowerCase()}
                role="option"
                tabIndex={-1}
                aria-selected={highlightedIndex === index}
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-sm",
                  highlightedIndex === index && "bg-accent",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelectSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      {tokens.length > 0 && (
        <div data-tag-chip-row className="flex flex-wrap gap-1 pt-1">
          {tokens.map((token) => (
            <span
              key={token.toLowerCase()}
              className="flex items-center gap-1 rounded bg-sidebar-accent px-2 py-1 text-xs"
            >
              {token}
              <button aria-label={`Remove ${token}`} onClick={() => onRemoveToken(token)}>
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
                <SidebarMenuButton
                  isActive={activeId === node.id}
                  aria-current={activeId === node.id ? "page" : undefined}
                  data-document-active={activeId === node.id ? "true" : undefined}
                  className={cn(activeId === node.id && "border-l-2 border-sidebar-primary font-semibold")}
                  onClick={() => onSelect(node.id)}
                >
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

function SearchResultItems({
  results,
  totalTokens,
  activeId,
  onSelect,
  onCopyPath,
}: {
  results: SearchResult[];
  totalTokens: number;
  activeId: string | null;
  onSelect: (id: string) => void;
  onCopyPath: (id: string) => void;
}) {
  return (
    <SidebarMenu aria-label="Ranked document results">
      {results.map((result) => (
        <SidebarMenuItem key={result.doc.id}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <SidebarMenuButton
                isActive={activeId === result.doc.id}
                aria-current={activeId === result.doc.id ? "page" : undefined}
                data-document-active={activeId === result.doc.id ? "true" : undefined}
                data-search-result="true"
                className={cn(
                  "h-auto min-h-12 items-start py-2 [&>div:last-child]:truncate-none",
                  activeId === result.doc.id && "border-l-2 border-sidebar-primary font-semibold",
                )}
                onClick={() => onSelect(result.doc.id)}
              >
                <FileText />
                <div className="min-w-0 flex-1">
                  <span className="block truncate leading-tight">{result.doc.label}</span>
                  {result.path.length > 0 && (
                    <span className="text-muted-foreground block truncate text-xs leading-tight">
                      {result.path.join(" / ")}
                    </span>
                  )}
                  <span className="text-muted-foreground block truncate text-xs leading-tight">
                    {result.score}/{totalTokens} · {result.matchedTags.join(", ")}
                  </span>
                </div>
              </SidebarMenuButton>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onCopyPath(result.doc.id)}>
                <Copy />
                Copy path
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar({
  tree,
  activeId,
  onSelect,
  onCopyPath,
  vaultName,
  vaults,
  dashboards,
  activeDashboardId,
  onSelectDashboard,
  onCreateDashboard,
  onRenameDashboard,
  onMoveDashboard,
  onRemoveDashboard,
  onRelocateDashboard,
  onManageSecrets,
}: Props) {
  const { state } = useSidebar();
  const searchIndex = useMemo(() => createSearchIndex(tree), [tree]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const activeTokens = uniqueTokens([...tokens, input]);
  const committedTokens = new Set(tokens.map((token) => token.toLowerCase()));
  const suggestions =
    suggestionsOpen && input.trim()
      ? searchIndex.suggestions.filter(
          (suggestion) =>
            suggestion.toLowerCase().includes(input.trim().toLowerCase()) &&
            !committedTokens.has(suggestion.toLowerCase()),
        )
      : [];
  const results = activeTokens.length ? scoreResults(searchIndex.documents, activeTokens) : [];
  const isSearching = activeTokens.length > 0;
  const activeSuggestionIndex = highlightedIndex !== null && suggestions[highlightedIndex] ? highlightedIndex : null;

  useEffect(() => {
    if (activeSuggestionIndex !== highlightedIndex) {
      setHighlightedIndex(activeSuggestionIndex);
    }
  }, [activeSuggestionIndex, highlightedIndex]);

  const commit = (value: string) => {
    setTokens((currentTokens) => addTokens(currentTokens, value));
    setInput("");
    setSuggestionsOpen(false);
    setHighlightedIndex(null);
  };
  const removeToken = (token: string) => {
    setTokens((currentTokens) =>
      currentTokens.filter((currentToken) => currentToken.toLowerCase() !== token.toLowerCase()),
    );
  };
  const selectSuggestion = (suggestion: string) => commit(suggestion);
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setHighlightedIndex((currentIndex) => (currentIndex === null ? 0 : (currentIndex + 1) % suggestions.length));
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(true);
      setHighlightedIndex((currentIndex) =>
        currentIndex === null ? suggestions.length - 1 : (currentIndex - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      activeSuggestionIndex !== null &&
      suggestions[activeSuggestionIndex]
    ) {
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(input);
      return;
    }
    if (event.key === "Escape" && suggestions.length) {
      event.preventDefault();
      setSuggestionsOpen(false);
      setHighlightedIndex(null);
      return;
    }
    if (event.key === "Backspace" && !input && tokens.length) {
      setTokens((currentTokens) => currentTokens.slice(0, -1));
    }
  };

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
        <SidebarTagSearch
          tokens={tokens}
          input={input}
          suggestions={suggestions}
          highlightedIndex={activeSuggestionIndex}
          onInputChange={(value) => {
            setInput(value);
            setSuggestionsOpen(true);
            setHighlightedIndex(null);
          }}
          onInputKeyDown={handleKeyDown}
          onPaste={(event) => {
            const pastedText = event.clipboardData.getData("text");
            const selectionStart = event.currentTarget.selectionStart ?? input.length;
            const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
            const prospectiveInput = `${input.slice(0, selectionStart)}${pastedText}${input.slice(selectionEnd)}`;
            event.preventDefault();
            const fragments = prospectiveInput.split(",");
            if (fragments.length > 1) {
              setTokens((currentTokens) => addTokens(currentTokens, fragments.slice(0, -1).join(",")));
              setInput(fragments.at(-1)!.trim());
            } else {
              setInput(prospectiveInput);
            }
            setSuggestionsOpen(true);
            setHighlightedIndex(null);
          }}
          onRemoveToken={removeToken}
          onSelectSuggestion={selectSuggestion}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">Dashboards</SidebarGroupLabel>
            <button
              className="hover:bg-sidebar-accent grid size-7 place-items-center rounded-md"
              aria-label="Create dashboard"
              title="Create dashboard"
              onClick={onCreateDashboard}
            >
              <Plus className="size-4" />
            </button>
          </div>
          {dashboards.length ? (
            <div
              aria-label="Dashboard launchers"
              tabIndex={0}
              className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto overscroll-contain px-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dashboards.map((dashboard, index) => {
                const Icon = dashboardIcons[dashboard.icon];
                const actions: Array<{
                  label: string;
                  disabled?: boolean;
                  destructive?: boolean;
                  onSelect: () => void;
                }> = [
                  { label: "Rename", onSelect: () => onRenameDashboard(dashboard) },
                  {
                    label: "Move earlier",
                    disabled: index === 0,
                    onSelect: () => onMoveDashboard(dashboard.id, -1),
                  },
                  {
                    label: "Move later",
                    disabled: index === dashboards.length - 1,
                    onSelect: () => onMoveDashboard(dashboard.id, 1),
                  },
                  {
                    label:
                      dashboard.location === "vault" ? "Move to this computer only" : "Move to shared vault storage",
                    onSelect: () => onRelocateDashboard(dashboard),
                  },
                  { label: "Manage secrets…", onSelect: () => onManageSecrets() },
                  { label: "Remove…", destructive: true, onSelect: () => onRemoveDashboard(dashboard) },
                ];
                return (
                  <ContextMenu key={dashboard.id}>
                    <ContextMenuTrigger asChild>
                      <div className="group relative">
                        <button
                          aria-label={`Open ${dashboard.title} dashboard`}
                          aria-pressed={activeDashboardId === dashboard.id}
                          onClick={() => onSelectDashboard(dashboard.id)}
                          className="flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span
                            className={cn(
                              "grid size-14 place-items-center rounded-[1.35rem] border transition-colors",
                              dashboardColors[dashboard.color],
                              activeDashboardId === dashboard.id && "ring-2 ring-ring",
                            )}
                          >
                            <Icon className="size-6" />
                          </span>
                          <span className="w-full truncate text-center text-xs font-medium">{dashboard.title}</span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              aria-label={`${dashboard.title} dashboard menu`}
                              className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-md opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {actions.map((action) => (
                              <DropdownMenuItem
                                key={action.label}
                                disabled={action.disabled}
                                variant={action.destructive ? "destructive" : "default"}
                                onSelect={action.onSelect}
                              >
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      {actions.map((action) => (
                        <ContextMenuItem
                          key={action.label}
                          disabled={action.disabled}
                          variant={action.destructive ? "destructive" : "default"}
                          onSelect={action.onSelect}
                        >
                          {action.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground px-2 py-1 text-xs">
              Create a dashboard for progress, work, goals, or ideas.
            </p>
          )}
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Documents</SidebarGroupLabel>
          {state === "collapsed" || !isSearching ? (
            tree.length ? (
              <TreeItems nodes={tree} activeId={activeId} onSelect={onSelect} onCopyPath={onCopyPath} />
            ) : (
              <p className="text-muted-foreground px-2 py-1 text-xs">No documents found.</p>
            )
          ) : results.length ? (
            <SearchResultItems
              results={results}
              totalTokens={activeTokens.length}
              activeId={activeId}
              onSelect={onSelect}
              onCopyPath={onCopyPath}
            />
          ) : (
            <p role="status" className="text-muted-foreground px-2 py-1 text-xs">
              No documents match these tags.
            </p>
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
