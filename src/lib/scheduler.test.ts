import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncScheduler } from "./scheduler";

describe("SyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls sync function on interval", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    scheduler.start();
    vi.advanceTimersByTime(3500);

    expect(syncFn).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it("stops calling after stop()", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    scheduler.start();
    vi.advanceTimersByTime(2500);
    scheduler.stop();
    vi.advanceTimersByTime(2000);

    expect(syncFn).toHaveBeenCalledTimes(2);
  });

  it("reports running state", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
