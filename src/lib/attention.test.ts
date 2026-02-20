import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { v4 as uuid } from "uuid";
import {
  createAttentionItem,
  resolveAttentionItem,
  getActiveItems,
  autoResolveByCondition,
} from "./attention";

describe("attention engine", () => {
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

  it("creates an attention item", () => {
    const item = createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI failing on PR #5",
      priority: 5,
      sourceUrl: "https://github.com/user/test/pull/5",
    });

    expect(item.id).toBeDefined();
    expect(item.type).toBe("checks_failing");
    expect(item.priority).toBe(5);
    expect(item.resolvedAt).toBeNull();
  });

  it("retrieves only active (unresolved) items sorted by priority", () => {
    createAttentionItem(db, {
      projectId,
      type: "new_project",
      title: "New repo discovered",
      priority: 1,
    });

    createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI failing",
      priority: 5,
    });

    const active = getActiveItems(db);
    expect(active).toHaveLength(2);
    expect(active[0].priority).toBe(5); // Higher priority first
    expect(active[1].priority).toBe(1);
  });

  it("resolves an attention item", () => {
    const item = createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI failing",
      priority: 5,
    });

    resolveAttentionItem(db, item.id);
    const active = getActiveItems(db);
    expect(active).toHaveLength(0);
  });

  it("auto-resolves items by type and project", () => {
    createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI failing on PR #5",
      priority: 5,
    });

    createAttentionItem(db, {
      projectId,
      type: "new_project",
      title: "New repo",
      priority: 1,
    });

    autoResolveByCondition(db, projectId, "checks_failing");

    const active = getActiveItems(db);
    expect(active).toHaveLength(1);
    expect(active[0].type).toBe("new_project");
  });

  it("does not create duplicate active items of the same type for same project", () => {
    createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI failing",
      priority: 5,
    });

    // Should not create a second one
    createAttentionItem(db, {
      projectId,
      type: "checks_failing",
      title: "CI still failing",
      priority: 5,
    });

    const active = getActiveItems(db);
    const checkItems = active.filter((i) => i.type === "checks_failing");
    expect(checkItems).toHaveLength(1);
  });
});
