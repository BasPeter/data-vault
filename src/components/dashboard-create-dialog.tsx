import { useState } from "react";
import type { DashboardColorId, DashboardCreateInput, DashboardIconId, DashboardKind } from "@/dashboard-contracts";
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

export function DashboardCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: DashboardCreateInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DashboardKind>("personal-progress");
  const [icon, setIcon] = useState<DashboardIconId>("target");
  const [color, setColor] = useState<DashboardColorId>("green");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        kind,
        icon,
        color,
      });
      setTitle("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create dashboard</DialogTitle>
          <DialogDescription>
            Choose a useful starting point. An agent can customize the local HTML, CSS, and JavaScript later.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1 text-sm">
          Name
          <Input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            Icon
            <select
              aria-label="Dashboard icon"
              className="border-input bg-background h-9 rounded-md border px-3"
              value={icon}
              onChange={(event) => setIcon(event.target.value as DashboardIconId)}
            >
              <option value="chart">Chart</option>
              <option value="check">Check</option>
              <option value="compass">Compass</option>
              <option value="lightbulb">Lightbulb</option>
              <option value="target">Target</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Colour
            <select
              aria-label="Dashboard colour"
              className="border-input bg-background h-9 rounded-md border px-3"
              value={color}
              onChange={(event) => setColor(event.target.value as DashboardColorId)}
            >
              <option value="blue">Blue</option>
              <option value="green">Green</option>
              <option value="orange">Orange</option>
              <option value="purple">Purple</option>
              <option value="slate">Slate</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          Starting purpose
          <select
            aria-label="Dashboard starting purpose"
            className="border-input bg-background h-9 rounded-md border px-3"
            value={kind}
            onChange={(event) => setKind(event.target.value as DashboardKind)}
          >
            <option value="personal-progress">Personal progress</option>
            <option value="vault-intelligence">Vault intelligence</option>
            <option value="blank">Blank</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!title.trim() || saving} onClick={submit}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
