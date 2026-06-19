import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Pencil, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const sanitize = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
});

export function QuickNotesPanel({ vaultId, version }: { vaultId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeHtml = useMemo(() => sanitize(html), [html]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHtml("");
    setDraft("");
    setEditing(false);
    setError(null);
    window.vaultApi.quickNotes(vaultId)
      .then((notes) => { if (!cancelled) setHtml(notes); })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [open, vaultId, version]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setEditing(false);
      setError(null);
    }
  };

  const startEditing = () => {
    setDraft(html);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await window.vaultApi.saveQuickNotes(vaultId, draft);
      setHtml(draft);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Quick notes" title="Quick notes">
          <StickyNote />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="flex flex-col">
        <SheetDescription className="sr-only">
          A scratchpad stored in the current vault outside its document structure.
        </SheetDescription>
        <SheetHeader className="flex-row items-center justify-between border-b pb-3">
          <SheetTitle>Quick notes</SheetTitle>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="icon" variant="ghost" onClick={startEditing} title="Edit quick notes" aria-label="Edit quick notes">
                <Pencil />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} title="Close" aria-label="Close quick notes">
              <X />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-4">
          {error && <p role="alert" className="text-destructive mb-2 text-sm">{error}</p>}
          {editing ? (
            <textarea
              className="bg-background h-full min-h-96 w-full resize-none rounded border p-2 font-mono text-sm"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Quick notes HTML"
              autoFocus
            />
          ) : safeHtml ? (
            <div className="doc-content" dangerouslySetInnerHTML={{ __html: safeHtml }} />
          ) : (
            <p className="text-muted-foreground text-sm">No quick notes yet.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
