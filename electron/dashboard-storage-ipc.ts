import type { DashboardCreateInput } from "../src/dashboard-contracts";
import type { VaultService } from "./vault";

type DashboardVaultService = Pick<
  VaultService,
  | "dashboards"
  | "createDashboard"
  | "renameDashboard"
  | "reorderDashboards"
  | "removeDashboard"
  | "dashboardAgentHandoff"
>;

type AssertTrusted<Event> = (event: Event) => void;

function stringArgument(value: unknown, name: string, maximum = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function createArgument(value: unknown): DashboardCreateInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid dashboard details.");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 4 ||
    typeof record.title !== "string" ||
    typeof record.icon !== "string" ||
    typeof record.color !== "string" ||
    typeof record.kind !== "string"
  ) {
    throw new Error("Invalid dashboard details.");
  }
  return {
    title: stringArgument(record.title, "dashboard title", 100),
    icon: record.icon as DashboardCreateInput["icon"],
    color: record.color as DashboardCreateInput["color"],
    kind: record.kind as DashboardCreateInput["kind"],
  };
}

function orderArgument(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Invalid dashboard order.");
  return value.map((id) => stringArgument(id, "dashboard ID", 64));
}

export function createDashboardStorageHandlers<Event>(
  assertTrusted: AssertTrusted<Event>,
  service: () => DashboardVaultService,
) {
  return {
    list(event: Event, vaultId: unknown) {
      assertTrusted(event);
      return service().dashboards(stringArgument(vaultId, "vault ID"));
    },
    create(event: Event, vaultId: unknown, input: unknown) {
      assertTrusted(event);
      return service().createDashboard(stringArgument(vaultId, "vault ID"), createArgument(input));
    },
    rename(event: Event, vaultId: unknown, dashboardId: unknown, title: unknown) {
      assertTrusted(event);
      return service().renameDashboard(
        stringArgument(vaultId, "vault ID"),
        stringArgument(dashboardId, "dashboard ID", 64),
        stringArgument(title, "dashboard title", 100),
      );
    },
    reorder(event: Event, vaultId: unknown, dashboardIds: unknown) {
      assertTrusted(event);
      return service().reorderDashboards(stringArgument(vaultId, "vault ID"), orderArgument(dashboardIds));
    },
    remove(event: Event, vaultId: unknown, dashboardId: unknown) {
      assertTrusted(event);
      return service().removeDashboard(
        stringArgument(vaultId, "vault ID"),
        stringArgument(dashboardId, "dashboard ID", 64),
      );
    },
    agentHandoff(event: Event, vaultId: unknown, dashboardId: unknown) {
      assertTrusted(event);
      return service().dashboardAgentHandoff(
        stringArgument(vaultId, "vault ID"),
        stringArgument(dashboardId, "dashboard ID", 64),
      );
    },
  };
}
