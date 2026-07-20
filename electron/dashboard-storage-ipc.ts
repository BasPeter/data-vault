import {
  DASHBOARD_STORAGE_LOCATIONS,
  type DashboardCreateInput,
  type DashboardStorageLocation,
} from "../src/dashboard-contracts";
import type { VaultService } from "./vault";

type DashboardVaultService = Pick<
  VaultService,
  | "dashboards"
  | "createDashboard"
  | "renameDashboard"
  | "reorderDashboards"
  | "removeDashboard"
  | "moveDashboard"
  | "dashboardAgentHandoff"
>;

type AssertTrusted<Event> = (event: Event) => void;

function stringArgument(value: unknown, name: string, maximum = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

// Storage location is a trusted-boundary argument: it selects which of two
// filesystem namespaces a dashboard is created in or moved to, so anything
// other than exactly "vault" or "local" is rejected rather than coerced.
function locationArgument(value: unknown): DashboardStorageLocation {
  if (typeof value !== "string" || !DASHBOARD_STORAGE_LOCATIONS.includes(value as DashboardStorageLocation)) {
    throw new Error("Invalid dashboard storage location.");
  }
  return value as DashboardStorageLocation;
}

function createArgument(value: unknown): DashboardCreateInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid dashboard details.");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 5 ||
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
    location: locationArgument(record.location),
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
    move(event: Event, vaultId: unknown, dashboardId: unknown, location: unknown) {
      assertTrusted(event);
      return service().moveDashboard(
        stringArgument(vaultId, "vault ID"),
        stringArgument(dashboardId, "dashboard ID", 64),
        locationArgument(location),
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
