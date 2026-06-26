import { useEffect, useState } from "react";
import { ArrowLeft, FolderTree, LibraryBig, Network, PanelsTopLeft, Rows3, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { VaultStructureEditor } from "@/components/vault-structure-editor";
import { cn } from "@/lib/utils";
import type { TreeNode, VaultStructure, VaultSummary, VaultUpdate } from "@/types";

type StructurePreset = {
  id: string;
  name: string;
  summary: string;
  bestFor: string;
  icon: typeof PanelsTopLeft;
  structure: VaultStructure;
};

const PRESETS: StructurePreset[] = [
  {
    id: "para",
    name: "PARA",
    summary: "Action-first folders for active outcomes, responsibilities, reusable references, and inactive material.",
    bestFor: "Personal knowledge bases and work vaults that mix projects, responsibilities, and reference notes.",
    icon: PanelsTopLeft,
    structure: {
      projects: {
        title: "Projects",
        description: "Short-term efforts with a clear outcome or deadline.",
      },
      areas: {
        title: "Areas",
        description: "Ongoing responsibilities and standards to maintain.",
      },
      resources: {
        title: "Resources",
        description: "Topic-based reference material, research, and reusable knowledge.",
      },
      archives: {
        title: "Archives",
        description: "Inactive projects, old areas, and retired resources kept for reference.",
      },
    },
  },
  {
    id: "johnny-decimal",
    name: "Numbered areas",
    summary: "A constrained numbered layout with stable locations and room for no more than ten broad areas.",
    bestFor: "Large personal or team repositories where fast retrieval and consistent filing matter.",
    icon: Rows3,
    structure: {
      "00-09-system": {
        title: "System",
        description: "Indexes, maps, templates, and vault operating notes.",
      },
      "10-19-work": {
        title: "Work",
        description: "Work domains, categories, and records grouped by stable numbered ranges.",
      },
      "20-29-learning": {
        title: "Learning",
        description: "Courses, study material, and notes from deliberate learning.",
      },
      "30-39-reference": {
        title: "Reference",
        description: "Evergreen reference topics and reusable background knowledge.",
      },
      "90-99-archive": {
        title: "Archive",
        description: "Inactive or superseded material kept out of the active structure.",
      },
    },
  },
  {
    id: "zettelkasten",
    name: "Zettelkasten",
    summary: "Separates capture, source notes, evergreen notes, and published outputs.",
    bestFor: "Research-heavy vaults where notes should become durable connected ideas over time.",
    icon: Network,
    structure: {
      inbox: {
        title: "Inbox",
        description: "Fleeting notes and unprocessed captures.",
      },
      literature: {
        title: "Literature notes",
        description: "Notes tied to books, articles, talks, and other sources.",
      },
      permanent: {
        title: "Permanent notes",
        description: "Atomic evergreen notes written in your own words and linked to related ideas.",
      },
      outputs: {
        title: "Outputs",
        description: "Drafts, essays, decisions, and other synthesized work.",
      },
      archive: {
        title: "Archive",
        description: "Retired notes and old drafts.",
      },
    },
  },
  {
    id: "study",
    name: "Study notes",
    summary: "A learning workflow from class or meeting notes through review, synthesis, and assignments.",
    bestFor: "Coursework, workshops, training, and recurring learning sessions.",
    icon: LibraryBig,
    structure: {
      sessions: {
        title: "Sessions",
        description: "Raw notes from classes, meetings, lectures, and workshops.",
      },
      cues: {
        title: "Cues and questions",
        description: "Prompts, questions, and retrieval cues used for review.",
      },
      summaries: {
        title: "Summaries",
        description: "Concise summaries and synthesis notes created after review.",
      },
      resources: {
        title: "Resources",
        description: "Readings, references, and supporting material.",
      },
      assessments: {
        title: "Assessments",
        description: "Assignments, practice, exam prep, and feedback.",
      },
    },
  },
];

function countDirectories(structure: VaultStructure): number {
  return Object.values(structure).reduce(
    (total, meta) => total + 1 + (meta.children ? countDirectories(meta.children) : 0),
    0,
  );
}

type VaultInitDialogProps = {
  vault: VaultSummary | null;
  onSkip: (vaultId: string) => void;
  onDone: (preferred?: string) => Promise<void>;
};

export function VaultInitDialog({ vault, onSkip, onDone }: VaultInitDialogProps) {
  const [name, setName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("");
  const [structure, setStructure] = useState<VaultStructure>({});
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [view, setView] = useState<"setup" | "structure">("setup");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault) return;
    setName(vault.name);
    setDefaultLanguage(vault.defaultLanguage ?? "");
    setStructure(vault.structure ?? {});
    setSelectedPreset(null);
    setTree([]);
    setView("setup");
    setError(null);

    let active = true;
    void window.vaultApi
      .manifest(vault.id)
      .then((manifest) => {
        if (active) setTree(manifest.tree);
      })
      .catch(() => {
        if (active) setTree([]);
      });
    return () => {
      active = false;
    };
  }, [vault]);

  const applyPreset = (preset: StructurePreset) => {
    setSelectedPreset(preset.id);
    setStructure(preset.structure);
  };

  const submit = async () => {
    if (!vault) return;
    setBusy(true);
    setError(null);
    try {
      const update: VaultUpdate = {
        name: name.trim(),
        defaultLanguage: defaultLanguage.trim(),
        structure,
      };
      const result = await window.vaultApi.updateVault(vault.id, update);
      await onDone(result.vault.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (vault && !busy) onSkip(vault.id);
  };

  const directoryCount = countDirectories(structure);

  return (
    <Dialog open={vault !== null} onOpenChange={(next) => !next && skip()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {view === "setup" ? (
          <>
            <DialogHeader>
              <DialogTitle>Set up vault metadata</DialogTitle>
              <DialogDescription>
                This repository does not have a vault.json file yet. Add the basics now, or skip and keep using the
                default layout.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="init-vault-name">
                  Name
                </label>
                <Input
                  id="init-vault-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="My vault"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="init-vault-language">
                  Default language
                </label>
                <Input
                  id="init-vault-language"
                  value={defaultLanguage}
                  onChange={(event) => setDefaultLanguage(event.target.value)}
                  placeholder="en"
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <div>
                <h3 className="text-sm font-medium">Structure presets</h3>
                <p className="text-muted-foreground text-xs">
                  Pick a starting layout, then adjust folder names and descriptions before saving.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRESETS.map((preset) => (
                  <PresetButton
                    key={preset.id}
                    preset={preset}
                    active={selectedPreset === preset.id}
                    onClick={() => applyPreset(preset)}
                  />
                ))}
              </div>
              <Button variant="outline" className="justify-start" onClick={() => setView("structure")}>
                <FolderTree />
                Review structure
                <span className="text-muted-foreground ml-auto text-xs">
                  {directoryCount > 0
                    ? `${directoryCount} ${directoryCount === 1 ? "directory" : "directories"}`
                    : "none selected"}
                </span>
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={skip} disabled={busy}>
                <SkipForward />
                Skip
              </Button>
              <Button onClick={submit} disabled={busy || !name.trim()}>
                {busy ? "Saving..." : "Create vault.json"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" aria-label="Back to setup" onClick={() => setView("setup")}>
                  <ArrowLeft />
                </Button>
                <DialogTitle>Review structure</DialogTitle>
              </div>
              <DialogDescription>
                Edit the preset or build your own structure. These descriptions guide the sidebar and agent skills.
              </DialogDescription>
            </DialogHeader>
            {vault && <VaultStructureEditor vault={vault} tree={tree} structure={structure} onChange={setStructure} />}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setView("setup")} disabled={busy}>
                <ArrowLeft />
                Back
              </Button>
              <Button onClick={submit} disabled={busy || !name.trim()}>
                {busy ? "Saving..." : "Create vault.json"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PresetButton({ preset, active, onClick }: { preset: StructurePreset; active: boolean; onClick: () => void }) {
  const Icon = preset.icon;
  return (
    <button
      type="button"
      className={cn(
        "hover:bg-accent flex min-h-36 flex-col gap-2 rounded-md border p-3 text-left text-sm transition-colors",
        active && "border-primary bg-primary/5",
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <span className="font-medium">{preset.name}</span>
      </div>
      <p className="text-muted-foreground text-xs">{preset.summary}</p>
      <p className="mt-auto text-xs">{preset.bestFor}</p>
    </button>
  );
}
