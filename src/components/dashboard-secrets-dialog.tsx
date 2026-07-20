import { useEffect, useState } from "react";
import type { DashboardSecretsOverview } from "@/dashboard-contracts";
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

export function DashboardSecretsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [overview, setOverview] = useState<DashboardSecretsOverview | null>(null);
  // Keyed by secret name. Never seeded from stored state — there is no API that
  // returns a value, and the panel must not imply one is readable.
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Clear on close too, so a typed-but-unsaved value does not linger in
    // renderer memory after the panel is dismissed.
    setError(null);
    setNotice(null);
    setValues({});
    if (!open) return;
    void window.vaultApi
      .dashboardSecrets()
      .then(setOverview)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [open]);

  const run = async (name: string, action: () => Promise<DashboardSecretsOverview>, message: string) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      setOverview(await action());
      setValues((current) => ({ ...current, [name]: "" }));
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const save = (name: string) =>
    run(name, () => window.vaultApi.setDashboardSecret(name, values[name] ?? ""), `Saved ${name}.`);

  const remove = (name: string) => {
    if (!window.confirm(`Delete ${name}? Dashboards that need it will stop working until you set it again.`)) return;
    return run(name, () => window.vaultApi.deleteDashboardSecret(name), `Deleted ${name}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Dashboard secrets</DialogTitle>
          <DialogDescription>
            Values are stored encrypted on this computer and are never added to a vault. Data Vault sends a secret to
            the listed sites on a dashboard&rsquo;s behalf — dashboards and agents never see the value.
          </DialogDescription>
        </DialogHeader>

        {overview && !overview.available && (
          <p role="alert" className="text-destructive text-sm">
            Secrets cannot be stored on this computer because the operating system keychain is unavailable. Data Vault
            will not save a secret unencrypted, so every secret is treated as not set.
          </p>
        )}

        {overview && overview.secrets.length === 0 && (
          <p className="text-muted-foreground text-sm">No dashboard needs a secret yet.</p>
        )}

        <div className="grid gap-4 text-sm">
          {overview?.secrets.map((secret) => {
            const orphaned = secret.requiredBy.length === 0;
            return (
              <div key={secret.name} className="grid gap-1 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-medium">{secret.name}</code>
                  <span className={secret.set ? "text-muted-foreground" : "text-destructive"}>
                    {secret.set ? "Set" : "Not set"}
                  </span>
                </div>

                {orphaned ? (
                  <span className="text-muted-foreground">
                    No installed dashboard asks for this any more. You can safely delete it.
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground">
                      Used by {secret.requiredBy.map((entry) => entry.title).join(", ")}
                    </span>
                    <span className="text-muted-foreground">Sent only to {secret.origins.join(", ")}</span>
                  </>
                )}

                <div className="mt-1 flex gap-2">
                  <label className="sr-only" htmlFor={`secret-${secret.name}`}>
                    New value for {secret.name}
                  </label>
                  <Input
                    id={`secret-${secret.name}`}
                    type="password"
                    autoComplete="off"
                    placeholder={secret.set ? "Enter a new value to replace it" : "Enter a value"}
                    disabled={!overview.available || busy !== null}
                    value={values[secret.name] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [secret.name]: event.target.value }))}
                  />
                  <Button
                    disabled={!overview.available || busy !== null || (values[secret.name] ?? "") === ""}
                    onClick={() => void save(secret.name)}
                  >
                    {secret.set ? "Update" : "Save"}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!secret.set || busy !== null}
                    onClick={() => void remove(secret.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {notice && <p className="text-muted-foreground text-sm">{notice}</p>}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
