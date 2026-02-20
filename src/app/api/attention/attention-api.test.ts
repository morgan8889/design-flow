import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { v4 as uuid } from "uuid";
import { createAttentionItem, getActiveItems } from "@/lib/attention";

describe("attention API data operations", () => {
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

  it("filters active items by type", () => {
    createAttentionItem(db, { projectId, type: "checks_failing", title: "CI", priority: 5 });
    createAttentionItem(db, { projectId, type: "new_project", title: "New", priority: 1 });

    const all = getActiveItems(db);
    expect(all).toHaveLength(2);

    const checksOnly = all.filter((i) => i.type === "checks_failing");
    expect(checksOnly).toHaveLength(1);
  });

  it("filters active items by project", () => {
    const project2 = uuid();
    db.insert(schema.projects).values({
      id: project2,
      name: "other-project",
      localPath: "/code/other",
      source: "local",
      isTracked: true,
    }).run();

    createAttentionItem(db, { projectId, type: "checks_failing", title: "CI", priority: 5 });
    createAttentionItem(db, { projectId: project2, type: "new_project", title: "New", priority: 1 });

    const filtered = getActiveItems(db, projectId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].projectId).toBe(projectId);
  });
});
