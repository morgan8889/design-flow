import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

describe("plans data layer", () => {
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
      githubUrl: "https://github.com/user/test",
      source: "github_discovered",
      isTracked: true,
    }).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("stores and retrieves plans for a project", () => {
    const planId = uuid();
    db.insert(schema.plans).values({
      id: planId,
      projectId,
      filePath: "docs/plans/design.md",
      title: "Design Plan",
      format: "generic-markdown",
      phases: JSON.stringify([
        { name: "Phase 1", status: "in_progress", tasks: [{ text: "Task A", done: true }] },
      ]),
      fileHash: "abc123",
    }).run();

    const result = db.select().from(schema.plans).where(eq(schema.plans.projectId, projectId)).all();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Design Plan");
    expect(result[0].format).toBe("generic-markdown");
  });

  it("cascades delete when project is removed", () => {
    const planId = uuid();
    db.insert(schema.plans).values({
      id: planId,
      projectId,
      filePath: "docs/plans/design.md",
      title: "Design Plan",
      format: "generic-markdown",
      phases: JSON.stringify([]),
      fileHash: "abc123",
    }).run();

    db.delete(schema.projects).where(eq(schema.projects.id, projectId)).run();
    const result = db.select().from(schema.plans).all();
    expect(result).toHaveLength(0);
  });
});
