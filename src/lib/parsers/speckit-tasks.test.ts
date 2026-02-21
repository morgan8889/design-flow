import { describe, it, expect } from "vitest";
import { speckitTasksProfile } from "./speckit-tasks";
import { detectAndParse } from "./index";

const SPECKIT_SAMPLE = `# Asset Portfolio Tracker

## Phase 1: Setup

- [x] T001 [P] [US1] Scaffold project structure
- [x] T002 [P] [US2] Set up database schema
- [ ] T003 [P] [US3] Create API routes

## Phase 2: Core Features

- [ ] T004 [M] [US4] Implement asset CRUD
- [ ] T005 [M] [US5] Add portfolio calculations
`;

const SPECKIT_NO_PHASES = `# Simple Tasks

- [x] T001 Initialize repo
- [ ] T002 Write tests
- [X] T003 Deploy
`;

describe("speckitTasksProfile", () => {
  describe("detect", () => {
    it("detects speckit format by T-prefixed task IDs", () => {
      expect(speckitTasksProfile.detect(SPECKIT_SAMPLE)).toBe(true);
    });

    it("detects lowercase x as done", () => {
      expect(speckitTasksProfile.detect("- [x] T001 some task")).toBe(true);
    });

    it("detects uppercase X as done", () => {
      expect(speckitTasksProfile.detect("- [X] T001 some task")).toBe(true);
    });

    it("detects unchecked tasks", () => {
      expect(speckitTasksProfile.detect("- [ ] T001 some task")).toBe(true);
    });

    it("does not detect generic markdown checklists without T IDs", () => {
      expect(speckitTasksProfile.detect("- [x] Install dependencies")).toBe(false);
    });

    it("does not detect task-list format", () => {
      expect(speckitTasksProfile.detect("### Task 1: Setup\n- [x] step")).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts title from H1", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.title).toBe("Asset Portfolio Tracker");
    });

    it("uses Untitled Plan when no H1", () => {
      const result = speckitTasksProfile.parse("- [ ] T001 task");
      expect(result.title).toBe("Untitled Plan");
    });

    it("sets format to speckit-tasks", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.format).toBe("speckit-tasks");
    });

    it("creates phases from H2 headings", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].name).toBe("Phase 1: Setup");
      expect(result.phases[1].name).toBe("Phase 2: Core Features");
    });

    it("parses tasks within phases", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases[0].tasks).toHaveLength(3);
      expect(result.phases[1].tasks).toHaveLength(2);
    });

    it("marks done tasks correctly", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases[0].tasks[0].done).toBe(true);  // T001 [x]
      expect(result.phases[0].tasks[1].done).toBe(true);  // T002 [x]
      expect(result.phases[0].tasks[2].done).toBe(false); // T003 [ ]
    });

    it("preserves full task text including ID and tags", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases[0].tasks[0].text).toBe("T001 [P] [US1] Scaffold project structure");
    });

    it("derives in_progress status when some tasks done", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases[0].status).toBe("in_progress"); // 2 of 3 done
    });

    it("derives not_started status when no tasks done", () => {
      const result = speckitTasksProfile.parse(SPECKIT_SAMPLE);
      expect(result.phases[1].status).toBe("not_started"); // 0 of 2 done
    });

    it("derives completed status when all tasks done", () => {
      const allDone = `# Plan\n## Phase 1\n- [x] T001 task a\n- [x] T002 task b\n`;
      const result = speckitTasksProfile.parse(allDone);
      expect(result.phases[0].status).toBe("completed");
    });

    it("falls back to a default Tasks phase when no H2 headings", () => {
      const result = speckitTasksProfile.parse(SPECKIT_NO_PHASES);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].name).toBe("Tasks");
      expect(result.phases[0].tasks).toHaveLength(3);
    });

    it("handles uppercase X as done in default phase", () => {
      const result = speckitTasksProfile.parse(SPECKIT_NO_PHASES);
      expect(result.phases[0].tasks[2].done).toBe(true); // [X] T003
    });
  });
});

describe("detectAndParse integration", () => {
  it("picks speckit-tasks parser for speckit content", () => {
    const result = detectAndParse(SPECKIT_SAMPLE);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("speckit-tasks");
  });

  it("speckit parser takes precedence over generic-markdown for T-ID tasks", () => {
    // Content that has both H2+checklists AND T-IDs — speckit should win
    const content = `# Plan\n\n## Phase 1\n- [x] T001 task\n- [ ] T002 other\n`;
    const result = detectAndParse(content);
    expect(result!.format).toBe("speckit-tasks");
  });
});
