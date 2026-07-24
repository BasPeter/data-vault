import { DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT } from "../src/dashboard-contracts";
import { canonicalDashboardExternalLinkUrl } from "./dashboard-preload-validation";

export type DashboardApiOperation =
  | "get-info"
  | "read-state"
  | "write-state"
  | "read-vault-index"
  | "read-documents"
  | "list-secrets"
  | "secure-fetch"
  | "open-external-link";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateDashboardApiArgument(operation: DashboardApiOperation, value: unknown): void {
  if (
    operation === "get-info" ||
    operation === "read-state" ||
    operation === "read-vault-index" ||
    operation === "list-secrets"
  ) {
    if (value !== undefined) throw new Error("Invalid dashboard API request.");
    return;
  }
  if (!record(value)) throw new Error("Invalid dashboard API request.");
  if (operation === "write-state") {
    if (Object.keys(value).length !== 1 || !("state" in value)) throw new Error("Invalid dashboard API request.");
    return;
  }
  if (operation === "secure-fetch") {
    // Shape only; the request body is validated in full and authorized against
    // declared secrets and origins where the call is performed.
    if (Object.keys(value).length !== 1 || !record(value.request)) throw new Error("Invalid dashboard API request.");
    return;
  }
  if (operation === "open-external-link") {
    if (Object.keys(value).length !== 1 || !("url" in value)) throw new Error("Invalid dashboard API request.");
    canonicalDashboardExternalLinkUrl(value.url);
    return;
  }
  if (operation !== "read-documents") throw new Error("Invalid dashboard API request.");
  if (Object.keys(value).length !== 1 || !Array.isArray(value.documentIds))
    throw new Error("Invalid dashboard API request.");
  if (value.documentIds.length > DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT)
    throw new Error("Invalid dashboard API request.");
  for (const id of value.documentIds) {
    if (typeof id !== "string" || id.length < 1 || id.length > 512) throw new Error("Invalid dashboard API request.");
  }
}

export function dashboardMainFrameIfAlive<TFrame>(contents: {
  isDestroyed: () => boolean;
  readonly mainFrame: TFrame;
}): TFrame | null {
  try {
    return contents.isDestroyed() ? null : contents.mainFrame;
  } catch {
    return null;
  }
}

export function isExactDashboardOriginRequest(url: string, runtimeId: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "vault-dashboard:" &&
      parsed.hostname === runtimeId &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === ""
    );
  } catch {
    return false;
  }
}

export function isAuthenticatedDashboardSender<TSender extends { id: number }, TFrame, TGeneration>(
  active: Readonly<{
    sender: TSender;
    frame: TFrame;
    generation: TGeneration;
    grantedGeneration: TGeneration | undefined;
  }>,
  sender: TSender,
  frame: TFrame | null,
): boolean {
  return (
    sender === active.sender &&
    frame === active.frame &&
    active.grantedGeneration !== undefined &&
    active.grantedGeneration === active.generation
  );
}
