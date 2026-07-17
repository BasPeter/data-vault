import { useEffect, useState } from "react";
import type { DashboardCapabilityId, DashboardManifest, DashboardPermissionDetails } from "@/dashboard-contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DashboardPermissionDialog({
  open,
  vaultId,
  dashboard,
  onOpenChange,
}: {
  open: boolean;
  vaultId: string;
  dashboard: DashboardManifest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [details, setDetails] = useState<DashboardPermissionDetails | null>(null);
  const [index, setIndex] = useState(false);
  const [documents, setDocuments] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !dashboard) return;
    setDetails(null);
    setError(null);
    void window.vaultApi
      .dashboardPermissionDetails(vaultId, dashboard.id)
      .then((next) => {
        setDetails(next);
        setIndex(next.effectivePermissions.capabilities.includes("vault:index:read"));
        setDocuments(next.effectivePermissions.capabilities.includes("vault:documents:read"));
        setSelected(new Set(next.effectivePermissions.selectedDocumentIds));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [dashboard, open, vaultId]);
  if (!dashboard) return null;
  const save = async () => {
    const capabilities: DashboardCapabilityId[] = [];
    if (index) capabilities.push("vault:index:read");
    if (documents) capabilities.push("vault:documents:read");
    try {
      await window.vaultApi.grantDashboardPermissions(
        vaultId,
        dashboard.id,
        capabilities,
        documents ? [...selected] : [],
      );
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const revoke = async () => {
    try {
      await window.vaultApi.revokeDashboardPermissions(vaultId, dashboard.id);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Manage dashboard access</DialogTitle>
          <DialogDescription>
            This trusted Data Vault dialog controls what “{dashboard.title}” can read. Dashboard code cannot open this
            dialog or approve itself.
          </DialogDescription>
        </DialogHeader>
        {details && (
          <div className="grid gap-3 text-sm">
            {details.requestedCapabilities.includes("vault:index:read") && (
              <label className="flex gap-2">
                <input type="checkbox" checked={index} onChange={(event) => setIndex(event.target.checked)} />
                <span>
                  <strong>Vault index</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Titles, dates, tags, and links. No document bodies or paths.
                  </span>
                </span>
              </label>
            )}
            {details.requestedCapabilities.includes("vault:documents:read") && (
              <label className="flex gap-2">
                <input type="checkbox" checked={documents} onChange={(event) => setDocuments(event.target.checked)} />
                <span>
                  <strong>Selected documents</strong>
                  <br />
                  <span className="text-muted-foreground">Read only the documents you select below.</span>
                </span>
              </label>
            )}
            {documents && (
              <fieldset className="grid max-h-48 gap-1 overflow-auto rounded-md border p-2">
                <legend className="px-1 text-xs">Allowed documents</legend>
                {details.documents.map((document) => (
                  <label key={document.id} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(document.id)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(document.id);
                          else next.delete(document.id);
                          return next;
                        })
                      }
                    />
                    <span className="truncate">{document.title}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="destructive" onClick={revoke}>
            Revoke all
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!details} onClick={save}>
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
