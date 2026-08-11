export type AppView =
  | { kind: "document" }
  | { kind: "graph" }
  | { kind: "tag-cloud" }
  | { kind: "dashboard"; dashboardId: string };

export function safeAppView(view: AppView, dashboardIds: ReadonlySet<string>): AppView {
  return view.kind === "dashboard" && !dashboardIds.has(view.dashboardId) ? { kind: "document" } : view;
}

export function parseStoredAppView(value: string | null): AppView {
  if (!value) return { kind: "document" };
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { kind: "document" };
    const record = parsed as Record<string, unknown>;
    if (record.kind === "document" && Object.keys(record).length === 1) return { kind: "document" };
    if (record.kind === "graph" && Object.keys(record).length === 1) return { kind: "graph" };
    if (record.kind === "tag-cloud" && Object.keys(record).length === 1) return { kind: "tag-cloud" };
    if (
      record.kind === "dashboard" &&
      Object.keys(record).length === 2 &&
      typeof record.dashboardId === "string" &&
      record.dashboardId.length > 0 &&
      record.dashboardId.length <= 64
    )
      return { kind: "dashboard", dashboardId: record.dashboardId };
  } catch {
    // Malformed or hand-edited preferences fail closed to Documents.
  }
  return { kind: "document" };
}
