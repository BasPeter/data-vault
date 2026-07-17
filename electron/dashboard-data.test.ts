import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_INDEX_MAX_DOCUMENTS,
  DASHBOARD_INDEX_RESPONSE_MAX_BYTES,
  DASHBOARD_SCHEMA_VERSION,
  type DashboardEffectivePermissions,
} from "../src/dashboard-contracts";
import { VaultService } from "./vault";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "data-vault-dashboard-data-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fixture(): { service: VaultService; vaultId: string; root: string; documents: string } {
  const root = temporaryDirectory();
  const documents = path.join(root, "documents");
  fs.mkdirSync(documents);
  fs.writeFileSync(path.join(root, "vault.json"), JSON.stringify({ documentsDirectory: "documents", format: "html" }));
  const service = new VaultService(temporaryDirectory());
  const vault = service.addLocal(root);
  return { service, vaultId: vault.id, root, documents };
}

function permissions(
  capabilities: DashboardEffectivePermissions["capabilities"],
  selectedDocumentIds: string[] = [],
): DashboardEffectivePermissions {
  return { schemaVersion: DASHBOARD_SCHEMA_VERSION, capabilities, selectedDocumentIds };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("VaultService dashboard intelligence", () => {
  it("returns deterministic bounded index metadata and links without document bodies or hidden data", () => {
    const { service, vaultId, root, documents } = fixture();
    const tags = Array.from({ length: 60 }, (_, index) => `tag-${index}`).join(",");
    const links = Array.from({ length: 110 }, () => '<a href="#b.html">B</a>').join("");
    fs.writeFileSync(
      path.join(documents, "a.html"),
      `<!--vault\ntitle: A\ndate: 2026-07-17\ntags: ${tags}\n-->\n<h1>secret body marker</h1>${links}`,
    );
    fs.writeFileSync(path.join(documents, "b.html"), "<!--vault\ntitle: B\n--><p>Body B</p>");
    fs.writeFileSync(path.join(documents, ".secret.html"), "<h1>Hidden secret</h1>");
    fs.writeFileSync(path.join(documents, "_private.html"), "<h1>Private secret</h1>");
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ credential: "not-for-dashboard" }));

    const snapshot = service.dashboardVaultIndex(vaultId, permissions(["vault:index:read"]));

    expect(snapshot.documents.map(({ id }) => id)).toEqual(["a.html", "b.html"]);
    expect(snapshot.documents[0]).toMatchObject({
      title: "A",
      metadata: { date: "2026-07-17" },
    });
    expect(snapshot.documents[0].tags).toHaveLength(50);
    expect(snapshot.documents[0].links).toEqual(["b.html"]);
    expect(JSON.stringify(snapshot)).not.toContain("secret body marker");
    expect(JSON.stringify(snapshot)).not.toContain("Hidden secret");
    expect(JSON.stringify(snapshot)).not.toContain("credential");
    expect(JSON.stringify(snapshot)).not.toContain(root);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(snapshot.limits.maxEncodedBytes);
  });

  it("truncates the index deterministically at its document count limit", () => {
    const { service, vaultId } = fixture();
    const documentIds = Array.from(
      { length: DASHBOARD_INDEX_MAX_DOCUMENTS + 1 },
      (_, index) => `${String(index).padStart(4, "0")}.html`,
    );
    vi.spyOn(service, "manifest").mockReturnValue({
      tree: documentIds.toReversed().map((id) => ({ type: "doc", id, label: id, date: null, tags: [] })),
    });
    vi.spyOn(service, "document").mockImplementation((_requestedVaultId, id) => ({
      id,
      title: id,
      meta: {},
      format: "html",
      source: "",
      html: "",
      sourceStartLine: 1,
    }));

    const first = service.dashboardVaultIndex(vaultId, permissions(["vault:index:read"]));
    expect(first.documents).toHaveLength(DASHBOARD_INDEX_MAX_DOCUMENTS);
    expect(first.truncated).toBe(true);
    expect(first.documents[0].id).toBe("0000.html");
    expect(first.documents.at(-1)?.id).toBe("1999.html");
  });

  it("truncates deterministically when metadata would exceed the encoded response limit", () => {
    const { service, vaultId, documents } = fixture();
    const title = "x".repeat(DASHBOARD_INDEX_RESPONSE_MAX_BYTES - Buffer.byteLength("<h1></h1>"));
    fs.writeFileSync(path.join(documents, "large-title.html"), `<h1>${title}</h1>`);

    const first = service.dashboardVaultIndex(vaultId, permissions(["vault:index:read"]));
    const second = service.dashboardVaultIndex(vaultId, permissions(["vault:index:read"]));

    expect(first).toEqual(second);
    expect(first.truncated).toBe(true);
    expect(first.documents).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(first), "utf8")).toBeLessThanOrEqual(DASHBOARD_INDEX_RESPONSE_MAX_BYTES);
  });

  it("denies index access immediately when the effective capability is revoked", () => {
    const { service, vaultId } = fixture();
    expect(() => service.dashboardVaultIndex(vaultId, permissions([]))).toThrow("Dashboard access denied");
  });

  it("returns only selected current documents and marks every body as an untrusted string", () => {
    const { service, vaultId, documents } = fixture();
    fs.writeFileSync(
      path.join(documents, "approved.html"),
      "<!--vault\ntitle: Approved\n--><p>Untrusted <b>HTML</b></p>",
    );
    fs.writeFileSync(path.join(documents, "other.html"), "<p>Other</p>");

    const snapshot = service.dashboardDocuments(vaultId, permissions(["vault:documents:read"], ["approved.html"]), [
      "approved.html",
    ]);
    expect(snapshot.documents).toEqual([
      {
        id: "approved.html",
        title: "Approved",
        format: "html",
        contentTrust: "untrusted",
        content: "<p>Untrusted <b>HTML</b></p>",
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("Other");
  });

  it("uses one non-enumerating denial for malformed, path-like, duplicate, unapproved, stale, and revoked IDs", () => {
    const { service, vaultId, documents } = fixture();
    fs.writeFileSync(path.join(documents, "approved.html"), "<p>Approved</p>");
    const granted = permissions(["vault:documents:read"], ["approved.html", "missing.html"]);
    const requests = [
      ["../approved.html"],
      ["C:/approved.html"],
      ["folder\\approved.html"],
      ["https://example.test/approved.html"],
      ["approved.html", "approved.html"],
      ["unapproved.html"],
      ["missing.html"],
    ];
    for (const request of requests) {
      expect(() => service.dashboardDocuments(vaultId, granted, request)).toThrow("Dashboard document request denied");
    }
    expect(() => service.dashboardDocuments(vaultId, permissions([], ["approved.html"]), ["approved.html"])).toThrow(
      "Dashboard document request denied",
    );
  });

  it("denies oversized selected documents without revealing their existence", () => {
    const { service, vaultId, documents } = fixture();
    fs.writeFileSync(path.join(documents, "large.html"), "x".repeat(2 * 1024 * 1024 + 1));
    expect(() =>
      service.dashboardDocuments(vaultId, permissions(["vault:documents:read"], ["large.html"]), ["large.html"]),
    ).toThrow("Dashboard document request denied");
  });
});
