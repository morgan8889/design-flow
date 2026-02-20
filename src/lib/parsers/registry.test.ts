import { describe, it, expect } from "vitest";
import { detectAndParse, registerProfile, getProfileNames } from "./index";

describe("parser registry", () => {
  it("lists registered profiles", () => {
    const names = getProfileNames();
    expect(names).toContain("generic-markdown");
  });

  it("detects and parses generic markdown", () => {
    const content = `# Test Plan\n\n## Phase 1: Setup\n- [x] Install deps\n- [ ] Configure\n`;
    const result = detectAndParse(content);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("generic-markdown");
    expect(result!.phases).toHaveLength(1);
  });

  it("checks frontmatter for framework field", () => {
    const content = `---\nframework: generic-markdown\n---\n# Plan\n\n## Phase 1\n- [ ] Task\n`;
    const result = detectAndParse(content);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("generic-markdown");
  });

  it("returns null for unrecognized content", () => {
    const content = "Just some random text with no structure at all.";
    const result = detectAndParse(content);
    expect(result).toBeNull();
  });

  it("allows registering new profiles", () => {
    registerProfile({
      name: "test-format",
      detect: (content) => content.includes("TEST_FORMAT_MARKER"),
      parse: () => ({
        title: "Test",
        format: "test-format",
        phases: [],
      }),
    });

    expect(getProfileNames()).toContain("test-format");

    const result = detectAndParse("TEST_FORMAT_MARKER\nsome content");
    expect(result).not.toBeNull();
    expect(result!.format).toBe("test-format");
  });
});
