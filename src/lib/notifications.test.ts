import { describe, it, expect } from "vitest";
import { shouldNotify, formatNotification } from "./notifications";

describe("notifications", () => {
  it("returns true for items at or above threshold", () => {
    expect(shouldNotify({ priority: 5 }, 4)).toBe(true);
    expect(shouldNotify({ priority: 4 }, 4)).toBe(true);
  });

  it("returns false for items below threshold", () => {
    expect(shouldNotify({ priority: 3 }, 4)).toBe(false);
    expect(shouldNotify({ priority: 1 }, 4)).toBe(false);
  });

  it("formats notification correctly", () => {
    const result = formatNotification({
      type: "checks_failing",
      title: "CI failing on PR #5",
      projectName: "my-project",
    });

    expect(result.title).toBe("DesignFlow: my-project");
    expect(result.message).toBe("CI failing on PR #5");
  });
});
