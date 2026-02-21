import { describe, it, expect } from "vitest";
import { genericMarkdownProfile } from "./generic-markdown";

describe("generic-markdown parser", () => {
  const sampleSpec = `# User Authentication System

## Phase 1: Design
- [x] Create wireframes in Figma
- [x] Define auth flow diagram
- [ ] Review with team

## Phase 2: API Implementation
- [ ] Set up JWT middleware
- [ ] Build login/register endpoints
- [ ] Add rate limiting

## Phase 3: Frontend
- [ ] Login page component
- [ ] Protected route wrapper
`;

  it("detects markdown with H2 phases and checklists", () => {
    expect(genericMarkdownProfile.detect(sampleSpec)).toBe(true);
  });

  it("does not detect plain text", () => {
    expect(genericMarkdownProfile.detect("Just some plain text without structure")).toBe(false);
  });

  it("extracts title from H1", () => {
    const result = genericMarkdownProfile.parse(sampleSpec);
    expect(result.title).toBe("User Authentication System");
  });

  it("extracts all phases", () => {
    const result = genericMarkdownProfile.parse(sampleSpec);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[0].name).toBe("Phase 1: Design");
    expect(result.phases[1].name).toBe("Phase 2: API Implementation");
    expect(result.phases[2].name).toBe("Phase 3: Frontend");
  });

  it("extracts tasks with done state", () => {
    const result = genericMarkdownProfile.parse(sampleSpec);
    const phase1 = result.phases[0];
    expect(phase1.tasks).toHaveLength(3);
    expect(phase1.tasks[0]).toEqual({ text: "Create wireframes in Figma", done: true });
    expect(phase1.tasks[2]).toEqual({ text: "Review with team", done: false });
  });

  it("derives phase status correctly", () => {
    const result = genericMarkdownProfile.parse(sampleSpec);
    expect(result.phases[0].status).toBe("in_progress"); // 2/3 done
    expect(result.phases[1].status).toBe("not_started");  // 0/3 done
    expect(result.phases[2].status).toBe("not_started");  // 0/2 done
  });

  it("handles spec with no checklists as single unstructured phase", () => {
    const noChecklists = `# My Plan\n\n## Phase 1: Design\n\nSome description without tasks.\n`;
    const result = genericMarkdownProfile.parse(noChecklists);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].tasks).toHaveLength(0);
  });

  it("sets format to generic-markdown", () => {
    const result = genericMarkdownProfile.parse(sampleSpec);
    expect(result.format).toBe("generic-markdown");
  });
});
