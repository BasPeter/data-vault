import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardCheck, ClipboardCopy, FolderPlus, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DirectoryMeta, TreeNode, VaultStructure, VaultSummary } from "@/types";

// Keep these aligned with the bounds enforced in electron/main.ts and
// electron/vault.ts; the renderer validates defensively so the user gets
// feedback before the main process rejects an oversized or malformed tree.
const STRUCTURE_MAX_NODES = 500;
const STRUCTURE_MAX_DEPTH = 16;
const STRUCTURE_MAX_TEXT = 1000;

// A row in the editable tree. `onDisk` marks directories that already exist in
// the repository (so their name is fixed and removing a row only drops its
// description, never the documents). Rows without it are part of the *desired*
// blueprint and may not exist yet.
type EditorNode = {
  uid: string;
  segment: string;
  title: string;
  description: string;
  onDisk: boolean;
  children: EditorNode[];
};

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function plannedNode(segment: string, meta: DirectoryMeta): EditorNode {
  return {
    uid: uid(),
    segment,
    title: meta.title ?? "",
    description: meta.description ?? "",
    onDisk: false,
    children: Object.entries(meta.children ?? {}).map(([key, child]) => plannedNode(key, child)),
  };
}

// Merge the on-disk folder tree with the saved structure so existing
// directories are pre-filled and structure entries that have no matching
// folder yet are surfaced as planned rows.
function buildNodes(tree: TreeNode[], structure: VaultStructure): EditorNode[] {
  const consumed = new Set<string>();
  const nodes: EditorNode[] = [];
  for (const node of tree) {
    if (node.type !== "folder") continue;
    const segment = node.id.split("/").pop() ?? node.id;
    const meta = structure[segment] ?? {};
    consumed.add(segment);
    nodes.push({
      uid: uid(),
      segment,
      title: meta.title ?? "",
      description: meta.description ?? "",
      onDisk: true,
      children: buildNodes(node.children, meta.children ?? {}),
    });
  }
  for (const [segment, meta] of Object.entries(structure)) {
    if (consumed.has(segment)) continue;
    nodes.push(plannedNode(segment, meta));
  }
  return nodes;
}

function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== ".." && !/[/\\]/.test(segment);
}

// Collapse the editable rows back into a VaultStructure. Bare on-disk folders
// with no metadata are dropped to keep vault.json lean, while planned rows are
// always kept so the intended blueprint survives even when still empty.
function toStructure(nodes: EditorNode[]): VaultStructure {
  const out: VaultStructure = {};
  for (const node of nodes) {
    const segment = node.segment.trim();
    if (!isSafeSegment(segment) || out[segment]) continue;
    const meta: DirectoryMeta = {};
    const title = node.title.trim();
    const description = node.description.trim();
    if (title) meta.title = title;
    if (description) meta.description = description;
    const children = toStructure(node.children);
    if (Object.keys(children).length) meta.children = children;
    if (title || description || Object.keys(children).length || !node.onDisk) out[segment] = meta;
  }
  return out;
}

function patchNode(nodes: EditorNode[], target: string, fn: (node: EditorNode) => EditorNode): EditorNode[] {
  return nodes.map((node) => {
    if (node.uid === target) return fn(node);
    if (!node.children.length) return node;
    const children = patchNode(node.children, target, fn);
    return children === node.children ? node : { ...node, children };
  });
}

function removeNode(nodes: EditorNode[], target: string): EditorNode[] {
  return nodes
    .filter((node) => node.uid !== target)
    .map((node) => (node.children.length ? { ...node, children: removeNode(node.children, target) } : node));
}

// Reject anything the main process would refuse so the JSON editor reports the
// problem inline instead of silently dropping content on save.
function parseStructure(text: string): VaultStructure {
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  let remaining = STRUCTURE_MAX_NODES;
  const level = (input: unknown, depth: number): VaultStructure => {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("Each level must be an object.");
    if (depth > STRUCTURE_MAX_DEPTH) throw new Error("Structure is nested too deeply.");
    const output: VaultStructure = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      if (!isSafeSegment(key)) throw new Error(`Invalid directory name: "${key}".`);
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`"${key}" must be an object.`);
      if (--remaining < 0) throw new Error("Structure has too many directories.");
      const node = raw as Record<string, unknown>;
      const entry: DirectoryMeta = {};
      for (const field of ["title", "description"] as const) {
        if (node[field] === undefined) continue;
        if (typeof node[field] !== "string" || (node[field] as string).length > STRUCTURE_MAX_TEXT) {
          throw new Error(`"${key}" has an invalid ${field}.`);
        }
        entry[field] = node[field] as string;
      }
      if (node.children !== undefined) {
        const children = level(node.children, depth + 1);
        if (Object.keys(children).length) entry.children = children;
      }
      output[key] = entry;
    }
    return output;
  };
  return level(value, 1);
}

function folderPaths(tree: TreeNode[], out: string[] = []): string[] {
  for (const node of tree) {
    if (node.type !== "folder") continue;
    out.push(`${node.id}/`);
    folderPaths(node.children, out);
  }
  return out;
}

// A self-contained brief an agent (Claude or Codex with the vault-guide skill)
// can act on to draft the structure from the documents already in the repo.
function buildAgentPrompt(vault: VaultSummary, tree: TreeNode[]): string {
  const folders = folderPaths(tree);
  const current =
    vault.structure && Object.keys(vault.structure).length ? JSON.stringify(vault.structure, null, 2) : "(none yet)";
  return [
    "You are organising a Data Vault knowledge repository.",
    "",
    `Repository: ${vault.repositoryPath}`,
    "Documents live under the `documents/` directory (unless `vault.json` sets `documentsDirectory`).",
    "",
    folders.length ? "Existing folders that contain documents:" : "The repository has no document folders yet.",
    ...folders.map((path) => `- ${path}`),
    "",
    "Task: inspect the documents in this repository and design a clear directory",
    "structure for it. Write your result to the `structure` field of `vault.json`.",
    "",
    "`structure` is a nested JSON object keyed by directory segment. Each entry may have:",
    '  - "title": a short human label for the directory',
    '  - "description": one sentence on what belongs there',
    '  - "children": a nested object of subdirectories using the same shape',
    "",
    "Rules: keys are single path segments (no slashes), titles/descriptions are plain",
    `text (max ${STRUCTURE_MAX_TEXT} chars), at most ${STRUCTURE_MAX_DEPTH} levels deep and ${STRUCTURE_MAX_NODES} directories total.`,
    "You may propose directories that do not exist yet; describe where existing documents should live.",
    "",
    "Current structure:",
    current,
    "",
    "Edit `vault.json` in place, preserving its other fields, then summarise the layout you chose.",
  ].join("\n");
}

type VaultStructureEditorProps = {
  vault: VaultSummary;
  tree: TreeNode[];
  structure: VaultStructure;
  onChange: (structure: VaultStructure) => void;
};

export function VaultStructureEditor({ vault, tree, structure, onChange }: VaultStructureEditorProps) {
  // Seed from the live draft (held by the settings dialog) so navigating away
  // and back preserves in-progress edits rather than reverting to disk.
  const [nodes, setNodes] = useState<EditorNode[]>(() => buildNodes(tree, structure));
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Re-seed when the manifest arrives (the dialog loads it asynchronously) so
  // existing folders appear without losing any edits already in flight.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || tree.length === 0) return;
    seeded.current = true;
    setNodes(buildNodes(tree, structure));
  }, [tree, structure]);

  // Push the structure up to the dialog whenever the rows change so a later
  // Save (and the JSON view) always reflect the current edits.
  useEffect(() => {
    onChangeRef.current(toStructure(nodes));
  }, [nodes]);

  const enterJson = () => {
    setJsonText(JSON.stringify(toStructure(nodes), null, 2));
    setJsonError(null);
    setMode("json");
  };

  const applyJson = () => {
    try {
      setNodes(buildNodes(tree, parseStructure(jsonText)));
      setJsonError(null);
      setMode("visual");
    } catch (cause) {
      setJsonError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const copyPrompt = async () => {
    const prompt = buildAgentPrompt(vault, tree);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; fall back to the JSON-style box so the
      // user can still select and copy the prompt manually.
      setMode("json");
      setJsonText(prompt);
      setJsonError("Copy was blocked — select the text above and copy it manually.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted flex rounded-md p-0.5">
          <ModeTab active={mode === "visual"} onClick={() => setMode("visual")}>
            Visual
          </ModeTab>
          <ModeTab active={mode === "json"} onClick={enterJson}>
            JSON
          </ModeTab>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyPrompt}>
            {copied ? <ClipboardCheck /> : <ClipboardCopy />}
            {copied ? "Copied" : "Copy AI prompt"}
          </Button>
        </div>
      </div>

      {mode === "visual" ? (
        <>
          <div className="flex flex-col gap-2">
            {nodes.length === 0 && (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
                No directories yet. Add the structure you want this vault to grow into.
              </p>
            )}
            {nodes.map((node) => (
              <NodeRow
                key={node.uid}
                node={node}
                depth={0}
                onPatch={(uid, patch) => setNodes((rows) => patchNode(rows, uid, (n) => ({ ...n, ...patch })))}
                onAddChild={(uid) =>
                  setNodes((rows) =>
                    patchNode(rows, uid, (n) => ({ ...n, children: [...n.children, plannedNode("", {})] })),
                  )
                }
                onRemove={(uid) => setNodes((rows) => removeNode(rows, uid))}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setNodes((rows) => [...rows, plannedNode("", {})])}
          >
            <FolderPlus />
            Add directory
          </Button>
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">Planned</span> directories are a blueprint and need not exist
            yet. Removing a row only deletes its description — documents in an existing folder stay visible either way.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Structure JSON"
            className="min-h-64 font-mono text-xs"
            spellCheck={false}
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
          />
          {jsonError && (
            <p role="alert" className="text-destructive text-sm">
              {jsonError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setJsonError(null);
                setMode("visual");
              }}
            >
              Discard
            </Button>
            <Button size="sm" onClick={applyJson}>
              Apply JSON
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1 text-sm font-medium transition-colors",
        active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function NodeRow({
  node,
  depth,
  onPatch,
  onAddChild,
  onRemove,
}: {
  node: EditorNode;
  depth: number;
  onPatch: (uid: string, patch: Partial<EditorNode>) => void;
  onAddChild: (uid: string) => void;
  onRemove: (uid: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const label = node.segment || "new directory";

  return (
    <div className="rounded-md border" style={{ marginLeft: depth * 16 }}>
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {node.onDisk ? (
            <span className="font-mono text-sm">{node.segment}/</span>
          ) : (
            <Input
              aria-label={node.segment ? `${node.segment} name` : "New directory name"}
              className="h-7 max-w-48 font-mono text-sm"
              value={node.segment}
              onChange={(event) => onPatch(node.uid, { segment: event.target.value })}
              placeholder="folder-name"
            />
          )}
          <Badge variant={node.onDisk ? "secondary" : "outline"}>{node.onDisk ? "on disk" : "planned"}</Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive ml-auto"
            title={node.onDisk ? "Remove description (keeps the folder and its documents)" : "Remove planned directory"}
            aria-label={`Remove ${label}`}
            onClick={() => onRemove(node.uid)}
          >
            <X />
          </Button>
        </div>
        {open && (
          <>
            <Input
              aria-label={node.segment ? `${node.segment} title` : "New directory title"}
              value={node.title}
              onChange={(event) => onPatch(node.uid, { title: event.target.value })}
              placeholder="Title"
            />
            <Input
              aria-label={node.segment ? `${node.segment} description` : "New directory description"}
              value={node.description}
              onChange={(event) => onPatch(node.uid, { description: event.target.value })}
              placeholder="Description (optional)"
            />
            <Button variant="ghost" size="xs" className="self-start" onClick={() => onAddChild(node.uid)}>
              <Plus />
              Add child
            </Button>
          </>
        )}
      </div>
      {open && node.children.length > 0 && (
        <div className="flex flex-col gap-2 px-2.5 pb-2.5">
          {node.children.map((child) => (
            <NodeRow
              key={child.uid}
              node={child}
              depth={1}
              onPatch={onPatch}
              onAddChild={onAddChild}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
