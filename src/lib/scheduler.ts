export class SyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private syncFn: () => Promise<void>;
  private intervalMs: number;

  constructor(syncFn: () => Promise<void>, intervalMs: number) {
    this.syncFn = syncFn;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(async () => {
      try {
        await this.syncFn();
      } catch (error) {
        console.error("Sync error:", error);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
