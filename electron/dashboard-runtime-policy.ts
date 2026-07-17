import type { Rectangle } from "electron";
import { DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT } from "../src/dashboard-contracts";

export type DashboardApiOperation = "get-info" | "read-state" | "write-state" | "read-vault-index" | "read-documents";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateDashboardApiArgument(operation: DashboardApiOperation, value: unknown): void {
  if (operation === "get-info" || operation === "read-state" || operation === "read-vault-index") {
    if (value !== undefined) throw new Error("Invalid dashboard API request.");
    return;
  }
  if (!record(value)) throw new Error("Invalid dashboard API request.");
  if (operation === "write-state") {
    if (Object.keys(value).length !== 1 || !("state" in value)) throw new Error("Invalid dashboard API request.");
    return;
  }
  if (Object.keys(value).length !== 1 || !Array.isArray(value.documentIds))
    throw new Error("Invalid dashboard API request.");
  if (value.documentIds.length > DASHBOARD_DOCUMENT_REQUEST_MAX_COUNT)
    throw new Error("Invalid dashboard API request.");
  for (const id of value.documentIds) {
    if (typeof id !== "string" || id.length < 1 || id.length > 512) throw new Error("Invalid dashboard API request.");
  }
}

export type DashboardBounds = Pick<Rectangle, "x" | "y" | "width" | "height">;

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

function intersect(left: Rectangle, right: Rectangle): Rectangle | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  if (endX <= x || endY <= y) return null;
  return { x, y, width: endX - x, height: endY - y };
}

export function validateDashboardBounds(
  value: unknown,
  contentBounds: Rectangle,
  allowedBounds: Rectangle,
): Rectangle | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || !["x", "y", "width", "height"].every((key) => key in record)) return null;
  const numbers = [record.x, record.y, record.width, record.height];
  if (numbers.some((item) => typeof item !== "number" || !Number.isFinite(item))) return null;
  const { x, y, width, height } = record as DashboardBounds;
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x > 100_000 ||
    y > 100_000 ||
    width > 100_000 ||
    height > 100_000
  ) {
    return null;
  }
  const enclosing = {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.ceil(x + width) - Math.floor(x),
    height: Math.ceil(y + height) - Math.floor(y),
  };
  const withinContent = intersect(enclosing, contentBounds);
  return withinContent ? intersect(withinContent, allowedBounds) : null;
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
