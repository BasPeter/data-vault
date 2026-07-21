export const DASHBOARD_EXTERNAL_LINK_MAX_PROMPTS_PER_MINUTE = 10;

/**
 * Keeps the trusted prompt state separate from untrusted dashboard code. A
 * cancellation increments the epoch so an already-visible native dialog can
 * never launch a link after its dashboard runtime has ended.
 */
export class DashboardExternalLinkPromptGate {
  private inFlight = false;
  private timestamps: number[] = [];
  private epoch = 0;

  async request(
    confirm: () => Promise<boolean>,
    reauthenticate: () => void,
    launch: () => Promise<void>,
    now = Date.now(),
  ): Promise<boolean> {
    if (this.inFlight) return false;
    this.timestamps = this.timestamps.filter((timestamp) => timestamp > now - 60_000);
    if (this.timestamps.length >= DASHBOARD_EXTERNAL_LINK_MAX_PROMPTS_PER_MINUTE) return false;
    this.timestamps.push(now);
    const epoch = this.epoch;
    this.inFlight = true;
    try {
      if (!(await confirm()) || epoch !== this.epoch) return false;
      reauthenticate();
      if (epoch !== this.epoch) return false;
      await launch();
      return epoch === this.epoch;
    } catch {
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  cancel(): void {
    this.epoch += 1;
    this.inFlight = false;
    this.timestamps = [];
  }
}
