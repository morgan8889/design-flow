import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { v4 as uuid } from "uuid";
import { syncProject } from "./sync";
import { getActiveItems } from "./attention";

const specContent = `# Auth System

## Phase 1: Design
- [x] Wireframes
- [ ] Review

## Phase 2: Build
- [ ] API endpoints
- [ ] Tests
`;

describe("full sync cycle integration", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let projectId: string;

  const mockGithub = {
    listRepos: vi.fn().mockResolvedValue([]),
    listOpenPRs: vi.fn().mockResolvedValue([
      {
        number: 1,
        title: "Add auth",
        htmlUrl: "https://github.com/user/proj/pull/1",
        requestedReviewers: ["reviewer"],
        draft: false,
        headSha: "sha123",
      },
    ]),
    getCheckRuns: vi.fn().mockResolvedValue([
      { name: "ci", status: "completed", conclusion: "success" },
    ]),
    listDirectoryContents: vi.fn().mockResolvedValue(["docs/plans/auth.md"]),
    listFilesRecursively: vi.fn().mockResolvedValue([]),
    listMergedPRs: vi.fn().mockResolvedValue([]),
    // Path-aware: only return content for known plan files; null for README.md probe
    getFileContent: vi.fn().mockImplementation((_owner: string, _repo: string, path: string) => {
      if (path === "docs/plans/auth.md") {
        return Promise.resolve({ content: specContent, sha: "filesha" });
      }
      return Promise.resolve(null);
    }),
  };

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });

    projectId = uuid();
    db.insert(schema.projects).values({
      id: projectId,
      name: "test-project",
      githubUrl: "https://github.com/user/proj",
      source: "github_discovered",
      isTracked: true,
    }).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("syncs PRs, checks, and plans in one cycle", async () => {
    await syncProject(db, projectId, mockGithub as any);

    // Should have PR review attention item
    const items = getActiveItems(db);
    expect(items.some((i: { type: string }) => i.type === "pr_needs_review")).toBe(true);

    // Should have parsed the plan
    const plans = db.select().from(schema.plans).all();
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Auth System");

    const phases = JSON.parse(plans[0].phases as string);
    expect(phases).toHaveLength(2);
    expect(phases[0].status).toBe("in_progress");
    expect(phases[1].status).toBe("not_started");
  });

  it("detects plan changes on second sync", async () => {
    // First sync
    await syncProject(db, projectId, mockGithub as any);

    // Change file content for second sync
    const updatedContent = specContent.replace("- [ ] Review", "- [x] Review");
    mockGithub.getFileContent.mockImplementation((_owner: string, _repo: string, path: string) => {
      if (path === "docs/plans/auth.md") {
        return Promise.resolve({ content: updatedContent, sha: "newsha" });
      }
      return Promise.resolve(null);
    });

    await syncProject(db, projectId, mockGithub as any);

    const items = getActiveItems(db);
    expect(items.some((i: { type: string }) => i.type === "plan_changed")).toBe(true);
  });
});
