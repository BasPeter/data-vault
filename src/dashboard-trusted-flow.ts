import type { DashboardRuntimeHostStatus, DashboardTrustedFlowPreparation } from "@/dashboard-contracts";

export type TrustedFlowDependencies = {
  prepare: () => Promise<DashboardTrustedFlowPreparation>;
  hide: () => void;
  remount: () => void;
  status: () => Promise<DashboardRuntimeHostStatus>;
  contextIsCurrent: () => boolean;
  canRemount: () => boolean;
  replacementIsHiddenAndInert: () => boolean;
  focusHost: () => void;
  now: () => number;
  wait: () => Promise<void>;
  timeoutMs: number;
};

export async function prepareDashboardTrustedFlow(dependencies: TrustedFlowDependencies): Promise<void> {
  const prepared = await dependencies.prepare();
  if (!dependencies.contextIsCurrent()) throw new Error("Dashboard trusted-flow context changed.");

  dependencies.hide();
  if (prepared.disposition === "retained") return;
  if (prepared.runtimeId === null || !dependencies.canRemount()) {
    throw new Error("Destroyed dashboard runtime did not match the active context.");
  }

  dependencies.remount();
  await waitForReplacement(prepared.runtimeId, dependencies);
}

async function waitForReplacement(oldRuntimeId: string, dependencies: TrustedFlowDependencies): Promise<void> {
  const deadline = dependencies.now() + dependencies.timeoutMs;
  while (dependencies.now() < deadline) {
    if (!dependencies.contextIsCurrent()) throw new Error("Dashboard remount context changed.");
    const replacement = await dependencies.status();
    if (!dependencies.contextIsCurrent()) throw new Error("Dashboard remount context changed.");
    if (replacement?.runtimeId !== oldRuntimeId && replacement?.attached === true && replacement.status === "ready") {
      if (!dependencies.replacementIsHiddenAndInert()) {
        throw new Error("Replacement dashboard was not hidden and input-disabled.");
      }
      dependencies.focusHost();
      return;
    }
    if (
      replacement?.status === "failed" ||
      replacement?.status === "stopped" ||
      replacement?.status === "unresponsive"
    ) {
      throw new Error("Replacement dashboard did not become ready.");
    }
    await dependencies.wait();
  }
  throw new Error("Replacement dashboard readiness timed out.");
}
