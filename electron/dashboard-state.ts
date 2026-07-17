import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DASHBOARD_STATE_MAX_BYTES,
  DASHBOARD_STATE_MAX_WRITES_PER_MINUTE,
  type DashboardState,
} from "../src/dashboard-contracts";
import { DashboardStorage } from "./dashboard-storage";

const RATE_WINDOW_MS = 60_000;
const MAX_VALIDATION_NODES = DASHBOARD_STATE_MAX_BYTES;

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function invalidState(cause?: unknown): Error {
  return new Error("Dashboard state is invalid.", cause === undefined ? undefined : { cause });
}

function encodedState(value: unknown): string {
  const active = new WeakSet<object>();
  const completed = new WeakSet<object>();
  const stack: Array<{ value: unknown; exit: boolean }> = [{ value, exit: false }];
  let visited = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const current = frame.value;
    if (current === null || typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw invalidState();
      continue;
    }
    if (typeof current !== "object") throw invalidState();

    if (frame.exit) {
      active.delete(current);
      completed.add(current);
      continue;
    }
    if (active.has(current)) throw invalidState();
    if (completed.has(current)) continue;
    visited += 1;
    if (visited > MAX_VALIDATION_NODES) throw invalidState();

    const prototype = Object.getPrototypeOf(current);
    if (Array.isArray(current)) {
      if (prototype !== Array.prototype) throw invalidState();
      for (let index = 0; index < current.length; index += 1) {
        if (!(index in current)) throw invalidState();
      }
      if (Reflect.ownKeys(current).some((key) => key !== "length" && !/^\d+$/.test(String(key)))) throw invalidState();
    } else if (prototype !== Object.prototype && prototype !== null) {
      throw invalidState();
    }

    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === "symbol")) throw invalidState();
    active.add(current);
    stack.push({ value: current, exit: true });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = String(keys[index]);
      if (Array.isArray(current) && key === "length") continue;
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) throw invalidState();
      stack.push({ value: descriptor.value, exit: false });
    }
  }

  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw invalidState(error);
  }
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > DASHBOARD_STATE_MAX_BYTES) throw invalidState();
  return encoded;
}

function fixedStateFile(storage: DashboardStorage, dashboardId: string): { bundle: string; file: string } {
  const { bundleDirectory } = storage.runtimeSource(dashboardId);
  const bundle = fs.realpathSync(bundleDirectory);
  const file = path.join(bundle, "state.json");
  if (!isWithin(bundle, file)) throw invalidState();
  return { bundle, file };
}

export class DashboardStateService {
  private readonly writes = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  read(storage: DashboardStorage, dashboardId: string): DashboardState {
    const { bundle, file } = fixedStateFile(storage, dashboardId);
    if (!fs.existsSync(file)) return null;
    try {
      const stats = fs.lstatSync(file);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > DASHBOARD_STATE_MAX_BYTES) throw invalidState();
      const canonical = fs.realpathSync(file);
      if (!isWithin(bundle, canonical)) throw invalidState();
      const source = fs.readFileSync(canonical, "utf8");
      const parsed: unknown = JSON.parse(source);
      encodedState(parsed);
      return parsed as DashboardState;
    } catch (error) {
      if (error instanceof Error && error.message === "Dashboard state is invalid.") throw error;
      throw invalidState(error);
    }
  }

  write(storage: DashboardStorage, dashboardId: string, runtimeId: string, value: unknown): void {
    if (typeof runtimeId !== "string" || runtimeId.length < 1 || runtimeId.length > 200) throw invalidState();
    const encoded = encodedState(value);
    const { bundle, file } = fixedStateFile(storage, dashboardId);
    if (fs.existsSync(file)) {
      const stats = fs.lstatSync(file);
      if (stats.isSymbolicLink() || !stats.isFile() || !isWithin(bundle, fs.realpathSync(file))) throw invalidState();
    }

    const now = this.now();
    const recent = (this.writes.get(runtimeId) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
    if (recent.length >= DASHBOARD_STATE_MAX_WRITES_PER_MINUTE) {
      this.writes.set(runtimeId, recent);
      throw new Error("Dashboard state write rate exceeded.");
    }

    const temporary = path.join(bundle, `.state-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, encoded, { encoding: "utf8", mode: 0o600, flag: "wx" });
      const temporaryStats = fs.lstatSync(temporary);
      if (
        temporaryStats.isSymbolicLink() ||
        !temporaryStats.isFile() ||
        !isWithin(bundle, fs.realpathSync(temporary))
      ) {
        throw invalidState();
      }
      fs.renameSync(temporary, file);
      recent.push(now);
      this.writes.set(runtimeId, recent);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  releaseRuntime(runtimeId: string): void {
    this.writes.delete(runtimeId);
  }
}
