// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

describe("projects data layer", () => {
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

  it("lists all projects", () => {
    db.insert(schema.projects)
      .values({
        id: uuid(),
        name: "project-a",
        githubUrl: "https://github.com/user/a",
        source: "github_discovered",
      })
      .run();

    db.insert(schema.projects)
      .values({
        id: uuid(),
        name: "project-b",
        localPath: "/code/b",
        source: "local",
        isTracked: true,
      })
      .run();

    const result = db.select().from(schema.projects).all();
    expect(result).toHaveLength(2);
  });

  it("creates a local project", () => {
    const id = uuid();
    db.insert(schema.projects)
      .values({
        id,
        name: "local-project",
        localPath: "/code/local",
        source: "local",
        isTracked: true,
      })
      .run();

    const result = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    expect(result?.name).toBe("local-project");
    expect(result?.isTracked).toBe(true);
  });

  it("toggles tracking on a project", () => {
    const id = uuid();
    db.insert(schema.projects)
      .values({
        id,
        name: "project",
        githubUrl: "https://github.com/user/repo",
        source: "github_discovered",
        isTracked: false,
      })
      .run();

    db.update(schema.projects)
      .set({ isTracked: true })
      .where(eq(schema.projects.id, id))
      .run();

    const result = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
    expect(result?.isTracked).toBe(true);
  });
});
