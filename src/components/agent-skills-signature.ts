import type { VaultSummary } from "@/types";

export function canonicalVaultSignature(vaults: VaultSummary[]): string {
  return JSON.stringify(
    vaults.map((vault) => ({
      id: vault.id,
      name: vault.name,
      repositoryPath: vault.repositoryPath,
      remoteUrl: vault.remoteUrl ?? null,
      format: vault.format,
      defaultLanguage: vault.defaultLanguage ?? null,
      structure: vault.structure ?? null,
    })),
  );
}
