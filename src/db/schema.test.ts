// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

describe("database schema", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("creates projects table", () => {
    const result = db.select().from(schema.projects).all();
    expect(result).toEqual([]);
  });

  it("creates plans table", () => {
    const result = db.select().from(schema.plans).all();
    expect(result).toEqual([]);
  });

  it("creates attention_items table", () => {
    const result = db.select().from(schema.attentionItems).all();
    expect(result).toEqual([]);
  });

  it("creates settings table", () => {
    const result = db.select().from(schema.settings).all();
    expect(result).toEqual([]);
  });

  it("inserts and retrieves a project", () => {
    db.insert(schema.projects)
      .values({
        id: "test-id",
        name: "test-project",
        githubUrl: "https://github.com/user/repo",
        source: "github_discovered",
        isTracked: false,
      })
      .run();

    const result = db.select().from(schema.projects).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("test-project");
    expect(result[0].isTracked).toBe(false);
  });
});
