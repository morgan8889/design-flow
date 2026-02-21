import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { v4 as uuid } from "uuid";
import { syncProject } from "./sync";
import { getActiveItems } from "./attention";

// Mock GitHub client
const mockGithub = {
  listRepos: vi.fn().mockResolvedValue([]),
  listOpenPRs: vi.fn().mockResolvedValue([]),
  getCheckRuns: vi.fn().mockResolvedValue([]),
  getFileContent: vi.fn().mockResolvedValue(null),
  listDirectoryContents: vi.fn().mockResolvedValue([]),
  listFilesRecursively: vi.fn().mockResolvedValue([]),
  listMergedPRs: vi.fn().mockResolvedValue([]),
};

describe("sync engine", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let projectId: string;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });

    projectId = uuid();
    db.insert(schema.projects).values({
      id: projectId,
      name: "test-project",
      githubUrl: "https://github.com/user/test-project",
      source: "github_discovered",
      isTracked: true,
    }).run();

    vi.clearAllMocks();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates attention item for failing checks", async () => {
    mockGithub.listOpenPRs.mockResolvedValueOnce([
      {
        number: 1,
        title: "Add feature",
        htmlUrl: "https://github.com/user/test-project/pull/1",
        requestedReviewers: [],
        draft: false,
        headSha: "abc123",
      },
    ]);

    mockGithub.getCheckRuns.mockResolvedValueOnce([
      { name: "test", status: "completed", conclusion: "failure" },
    ]);

    await syncProject(db, projectId, mockGithub as any);

    const items = getActiveItems(db);
    expect(items.some((i: { type: string }) => i.type === "checks_failing")).toBe(true);
  });

  it("creates attention item for PR needing review", async () => {
    mockGithub.listOpenPRs.mockResolvedValueOnce([
      {
        number: 2,
        title: "Fix bug",
        htmlUrl: "https://github.com/user/test-project/pull/2",
        requestedReviewers: ["user"],
        draft: false,
        headSha: "def456",
      },
    ]);

    mockGithub.getCheckRuns.mockResolvedValueOnce([]);

    await syncProject(db, projectId, mockGithub as any);

    const items = getActiveItems(db);
    expect(items.some((i: { type: string }) => i.type === "pr_needs_review")).toBe(true);
  });

  it("upserts merged PRs with spec number into pull_requests", async () => {
    mockGithub.listMergedPRs.mockResolvedValueOnce([
      {
        number: 16,
        title: "Portfolio Management",
        htmlUrl: "https://github.com/user/repo/pull/16",
        headRef: "016-portfolio-management",
        state: "merged",
        mergedAt: "2026-02-04T00:00:00Z",
      },
      {
        number: 99,
        title: "Bugfix",
        htmlUrl: "https://github.com/user/repo/pull/99",
        headRef: "fix/some-bug",
        state: "closed",
        mergedAt: null,
      },
    ]);

    await syncProject(db, projectId, mockGithub as any);

    const prs = db.select().from(schema.pullRequests).all();
    expect(prs).toHaveLength(2);

    const spec = prs.find((p: any) => p.number === 16);
    expect(spec.specNumber).toBe("016");
    expect(spec.state).toBe("merged");
    expect(spec.branchRef).toBe("016-portfolio-management");

    const bugfix = prs.find((p: any) => p.number === 99);
    expect(bugfix.specNumber).toBeNull();
  });

  it("auto-resolves checks_failing when checks pass", async () => {
    // First sync: checks failing
    mockGithub.listOpenPRs.mockResolvedValueOnce([
      { number: 1, title: "PR", htmlUrl: "url", requestedReviewers: [], draft: false, headSha: "abc" },
    ]);
    mockGithub.getCheckRuns.mockResolvedValueOnce([
      { name: "test", status: "completed", conclusion: "failure" },
    ]);
    await syncProject(db, projectId, mockGithub as any);
    expect(getActiveItems(db).some((i: { type: string }) => i.type === "checks_failing")).toBe(true);

    // Second sync: checks pass
    mockGithub.listOpenPRs.mockResolvedValueOnce([
      { number: 1, title: "PR", htmlUrl: "url", requestedReviewers: [], draft: false, headSha: "abc" },
    ]);
    mockGithub.getCheckRuns.mockResolvedValueOnce([
      { name: "test", status: "completed", conclusion: "success" },
    ]);
    await syncProject(db, projectId, mockGithub as any);
    expect(getActiveItems(db).some((i: { type: string }) => i.type === "checks_failing")).toBe(false);
  });
});
