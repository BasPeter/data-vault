import { useState } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type TourStep = { title: string; body: string };

const STEPS: TourStep[] = [
  {
    title: "Welcome to Data Vault",
    body: "Data Vault is a viewer for Git-backed HTML knowledge vaults. This quick tour points out the main features so you can get going.",
  },
  {
    title: "Browse your documents",
    body: "The sidebar lists the document tree for the active vault. Click a document to open it, or expand a folder to dig deeper.",
  },
  {
    title: "Switch and add vaults",
    body: "Use the switcher in the top bar to jump between vaults, open an existing local repository, or clone a new one from Git.",
  },
  {
    title: "Sync with Git",
    body: "The sync button pulls the latest commits from the vault's remote, so you are always reading the newest documents.",
  },
  {
    title: "Quick notes",
    body: "Keep a per-vault scratchpad with the quick notes panel. It lives outside your document structure and is never committed automatically.",
  },
  {
    title: "See the graph",
    body: "Toggle the graph view to explore how documents link to one another and navigate the vault visually.",
  },
  {
    title: "Agent skills",
    body: "At the bottom of the sidebar you can install the vault-guide and document-reviewer skills, letting Claude and Codex read, edit, and review your vaults.",
  },
  {
    title: "Stay up to date",
    body: "Also at the bottom of the sidebar, check for and install Data Vault updates so you always have the latest version.",
  },
];

export function GuidedTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const start = () => {
    setStep(0);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <Button variant="ghost" size="icon" title="Guided tour" aria-label="Start guided tour" onClick={start}>
        <CircleHelp />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Guided tour"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-card w-full max-w-md rounded-xl border p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">{current.title}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-2 -mr-2 shrink-0"
                onClick={close}
                aria-label="Close guided tour"
              >
                <X />
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{current.body}</p>
            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="text-muted-foreground text-xs tabular-nums">
                Step {step + 1} of {STEPS.length}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep((value) => value - 1)} disabled={isFirst}>
                  <ChevronLeft />
                  Back
                </Button>
                {isLast ? (
                  <Button size="sm" onClick={close}>
                    Done
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStep((value) => value + 1)}>
                    Next
                    <ChevronRight />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
