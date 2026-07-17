import { describe, expect, it } from "vitest";
import { parseStoredAppView, safeAppView } from "./app-view";

describe("safeAppView", () => {
  it("preserves document and graph views and falls back from a missing dashboard", () => {
    const dashboards = new Set(["present"]);
    expect(safeAppView({ kind: "document" }, dashboards)).toEqual({ kind: "document" });
    expect(safeAppView({ kind: "graph" }, dashboards)).toEqual({ kind: "graph" });
    expect(safeAppView({ kind: "dashboard", dashboardId: "present" }, dashboards)).toEqual({
      kind: "dashboard",
      dashboardId: "present",
    });
    expect(safeAppView({ kind: "dashboard", dashboardId: "missing" }, dashboards)).toEqual({ kind: "document" });
  });

  it("parses only exact bounded stored view preferences", () => {
    expect(parseStoredAppView('{"kind":"dashboard","dashboardId":"focus"}')).toEqual({
      kind: "dashboard",
      dashboardId: "focus",
    });
    expect(parseStoredAppView('{"kind":"dashboard","dashboardId":"focus","grant":true}')).toEqual({ kind: "document" });
    expect(parseStoredAppView("not json")).toEqual({ kind: "document" });
  });
});
