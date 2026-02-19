# DesignFlow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an attention-driven web app that aggregates GitHub and local repo signals into a prioritized inbox, with adaptive spec parsing for implementation status tracking.

**Architecture:** Next.js 14+ App Router with API routes serving both the React frontend and a future Swift app. SQLite via Drizzle ORM for persistence. Background polling sync engine runs server-side on a configurable interval. Adaptive parser profiles detect and extract phases/tasks from multiple spec framework formats.

**Tech Stack:** Next.js 14+, TypeScript, Drizzle ORM, better-sqlite3, Octokit, Zod, Vitest, Tailwind CSS, shadcn/ui, node-notifier

**Design doc:** `docs/plans/2026-02-19-design-flow-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.env.example`

**Step 1: Initialize Next.js project**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Expected: Project scaffolded with App Router structure.

**Step 2: Install core dependencies**

Run:
```bash
npm install drizzle-orm better-sqlite3 @octokit/rest zod node-notifier uuid
npm install -D drizzle-kit @types/better-sqlite3 @types/node-notifier @types/uuid vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

**Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

**Step 4: Create .env.example**

```
GITHUB_PAT=
DATABASE_PATH=./data/designflow.db
SYNC_INTERVAL_MS=180000
NOTIFICATION_PRIORITY_THRESHOLD=4
```

**Step 5: Add scripts to package.json**

Add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

**Step 6: Verify setup**

Run: `npm run test:run`
Expected: 0 tests, no errors.

Run: `npm run dev`
Expected: Next.js dev server starts on localhost:3000.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with dependencies"
```

---

## Task 2: Database Schema & Migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
- Test: `src/db/schema.test.ts`

**Step 1: Write the failing test**

Create `src/db/schema.test.ts`:

```ts
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
    db.insert(schema.projects).values({
      id: "test-id",
      name: "test-project",
      githubUrl: "https://github.com/user/repo",
      source: "github_discovered",
      isTracked: false,
    }).run();

    const result = db.select().from(schema.projects).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("test-project");
    expect(result[0].isTracked).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/schema.test.ts`
Expected: FAIL — modules not found.

**Step 3: Write schema**

Create `src/db/schema.ts`:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  githubUrl: text("github_url"),
  localPath: text("local_path"),
  source: text("source", { enum: ["github_discovered", "github_manual", "local"] }).notNull(),
  isTracked: integer("is_tracked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  lastSyncedAt: text("last_synced_at"),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  title: text("title").notNull(),
  format: text("format").notNull(),
  phases: text("phases", { mode: "json" }).notNull(),
  fileHash: text("file_hash").notNull(),
  parsedAt: text("parsed_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const attentionItems = sqliteTable("attention_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),
  type: text("type", {
    enum: [
      "pr_needs_review",
      "checks_failing",
      "pr_merge_ready",
      "plan_changed",
      "phase_blocked",
      "new_project",
      "stale_project",
    ],
  }).notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  priority: integer("priority").notNull(),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  resolvedAt: text("resolved_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

**Step 4: Create Drizzle config and generate migration**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/designflow.db",
  },
});
```

Run:
```bash
npx drizzle-kit generate
```

Expected: Migration files created in `./drizzle/`.

**Step 5: Create DB connection module**

Create `src/db/index.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || "./data/designflow.db";

function getDb() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

let db: ReturnType<typeof getDb> | null = null;

export function getDatabase() {
  if (!db) {
    db = getDb();
  }
  return db;
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run src/db/schema.test.ts`
Expected: All 5 tests PASS.

**Step 7: Commit**

```bash
git add src/db/ drizzle/ drizzle.config.ts
git commit -m "feat: add database schema with projects, plans, attention_items, settings"
```

---

## Task 3: Shared Types & Validation

**Files:**
- Create: `src/lib/types.ts`, `src/lib/validators.ts`
- Test: `src/lib/validators.test.ts`

**Step 1: Write the failing test**

Create `src/lib/validators.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
  attentionFilterSchema,
} from "./validators";

describe("createProjectSchema", () => {
  it("accepts valid github project", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      githubUrl: "https://github.com/user/repo",
      source: "github_manual",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid local project", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      localPath: "/Users/nick/Code/project",
      source: "local",
    });
    expect(result.success).toBe(true);
  });

  it("rejects project with neither githubUrl nor localPath", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      source: "local",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createProjectSchema.safeParse({
      name: "",
      localPath: "/some/path",
      source: "local",
    });
    expect(result.success).toBe(false);
  });
});

describe("attentionFilterSchema", () => {
  it("accepts valid filters", () => {
    const result = attentionFilterSchema.safeParse({
      type: "pr_needs_review",
      projectId: "some-id",
      resolved: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty filters", () => {
    const result = attentionFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validators.test.ts`
Expected: FAIL — modules not found.

**Step 3: Write types**

Create `src/lib/types.ts`:

```ts
export type ProjectSource = "github_discovered" | "github_manual" | "local";

export type AttentionType =
  | "pr_needs_review"
  | "checks_failing"
  | "pr_merge_ready"
  | "plan_changed"
  | "phase_blocked"
  | "new_project"
  | "stale_project";

export type PhaseStatus = "not_started" | "in_progress" | "completed";

export interface PlanTask {
  text: string;
  done: boolean;
}

export interface PlanPhase {
  name: string;
  status: PhaseStatus;
  tasks: PlanTask[];
}

export interface ParsedPlan {
  title: string;
  format: string;
  phases: PlanPhase[];
}

export interface ParserProfile {
  name: string;
  detect: (content: string) => boolean;
  parse: (content: string) => ParsedPlan;
}
```

**Step 4: Write validators**

Create `src/lib/validators.ts`:

```ts
import { z } from "zod";

export const createProjectSchema = z
  .object({
    name: z.string().min(1),
    githubUrl: z.string().url().optional(),
    localPath: z.string().min(1).optional(),
    source: z.enum(["github_discovered", "github_manual", "local"]),
  })
  .refine((data) => data.githubUrl || data.localPath, {
    message: "At least one of githubUrl or localPath is required",
  });

export const updateProjectSchema = z.object({
  isTracked: z.boolean().optional(),
  localPath: z.string().min(1).optional(),
  githubUrl: z.string().url().optional(),
});

export const attentionFilterSchema = z.object({
  type: z
    .enum([
      "pr_needs_review",
      "checks_failing",
      "pr_merge_ready",
      "plan_changed",
      "phase_blocked",
      "new_project",
      "stale_project",
    ])
    .optional(),
  projectId: z.string().optional(),
  resolved: z.boolean().optional(),
});
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/validators.test.ts`
Expected: All 5 tests PASS.

**Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: add shared types and Zod validators"
```

---

## Task 4: Projects API

**Files:**
- Create: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`
- Test: `src/app/api/projects/projects.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/projects/projects.test.ts`:

```ts
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
    db.insert(schema.projects).values({
      id: uuid(),
      name: "project-a",
      githubUrl: "https://github.com/user/a",
      source: "github_discovered",
    }).run();

    db.insert(schema.projects).values({
      id: uuid(),
      name: "project-b",
      localPath: "/code/b",
      source: "local",
      isTracked: true,
    }).run();

    const result = db.select().from(schema.projects).all();
    expect(result).toHaveLength(2);
  });

  it("creates a local project", () => {
    const id = uuid();
    db.insert(schema.projects).values({
      id,
      name: "local-project",
      localPath: "/code/local",
      source: "local",
      isTracked: true,
    }).run();

    const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    expect(result?.name).toBe("local-project");
    expect(result?.isTracked).toBe(true);
  });

  it("toggles tracking on a project", () => {
    const id = uuid();
    db.insert(schema.projects).values({
      id,
      name: "project",
      githubUrl: "https://github.com/user/repo",
      source: "github_discovered",
      isTracked: false,
    }).run();

    db.update(schema.projects).set({ isTracked: true }).where(eq(schema.projects.id, id)).run();

    const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    expect(result?.isTracked).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/projects/projects.test.ts`
Expected: FAIL — imports resolve but may need path alias config for vitest.

**Step 3: Write the API routes**

Create `src/app/api/projects/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { createProjectSchema } from "@/lib/validators";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDatabase();
  const projects = db.select().from(schema.projects).all();
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDatabase();
  const project = {
    id: uuid(),
    name: parsed.data.name,
    githubUrl: parsed.data.githubUrl ?? null,
    localPath: parsed.data.localPath ?? null,
    source: parsed.data.source,
    isTracked: true,
  };

  db.insert(schema.projects).values(project).run();
  return NextResponse.json(project, { status: 201 });
}
```

Create `src/app/api/projects/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { updateProjectSchema } from "@/lib/validators";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDatabase();
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = getDatabase();
  const existing = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  db.update(schema.projects).set(parsed.data).where(eq(schema.projects.id, id)).run();
  const updated = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  return NextResponse.json(updated);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/projects/projects.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/projects/
git commit -m "feat: add projects API routes (GET, POST, PATCH)"
```

---

## Task 5: GitHub Client

**Files:**
- Create: `src/lib/github.ts`
- Test: `src/lib/github.test.ts`

**Step 1: Write the failing test**

Create `src/lib/github.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubClient } from "./github";

// Mock Octokit
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      repos: {
        listForAuthenticatedUser: vi.fn().mockResolvedValue({
          data: [
            { name: "repo-a", html_url: "https://github.com/user/repo-a", full_name: "user/repo-a" },
            { name: "repo-b", html_url: "https://github.com/user/repo-b", full_name: "user/repo-b" },
          ],
          headers: { etag: "abc123" },
        }),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              number: 1,
              title: "Add feature",
              html_url: "https://github.com/user/repo/pull/1",
              requested_reviewers: [{ login: "user" }],
              draft: false,
            },
          ],
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            check_runs: [
              { name: "test", status: "completed", conclusion: "failure" },
            ],
          },
        }),
      },
    },
  })),
}));

describe("GitHubClient", () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient("fake-token");
  });

  it("fetches user repos", async () => {
    const repos = await client.listRepos();
    expect(repos).toHaveLength(2);
    expect(repos[0].name).toBe("repo-a");
  });

  it("fetches open PRs for a repo", async () => {
    const prs = await client.listOpenPRs("user", "repo");
    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe("Add feature");
  });

  it("fetches check runs for a ref", async () => {
    const checks = await client.getCheckRuns("user", "repo", "abc123");
    expect(checks).toHaveLength(1);
    expect(checks[0].conclusion).toBe("failure");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/github.test.ts`
Expected: FAIL — `GitHubClient` not found.

**Step 3: Write the GitHub client**

Create `src/lib/github.ts`:

```ts
import { Octokit } from "@octokit/rest";

export interface GitHubRepo {
  name: string;
  fullName: string;
  htmlUrl: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  htmlUrl: string;
  requestedReviewers: string[];
  draft: boolean;
}

export interface GitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listRepos(): Promise<GitHubRepo[]> {
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
    });

    return data.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
    }));
  }

  async listOpenPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      requestedReviewers: (pr.requested_reviewers ?? []).map((r: any) => r.login),
      draft: pr.draft ?? false,
    }));
  }

  async getCheckRuns(owner: string, repo: string, ref: string): Promise<GitHubCheckRun[]> {
    const { data } = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref,
    });

    return data.check_runs.map((check) => ({
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
    }));
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if ("content" in data && typeof data.content === "string") {
        return {
          content: Buffer.from(data.content, "base64").toString("utf-8"),
          sha: data.sha,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async listDirectoryContents(owner: string, repo: string, path: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(data)) {
        return data.filter((item) => item.type === "file").map((item) => item.path);
      }
      return [];
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/github.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/github.ts src/lib/github.test.ts
git commit -m "feat: add GitHub client wrapper for repos, PRs, checks"
```

---

## Task 6: Generic Markdown Parser

**Files:**
- Create: `src/lib/parsers/generic-markdown.ts`
- Test: `src/lib/parsers/generic-markdown.test.ts`

**Step 1: Write the failing test**

Create `src/lib/parsers/generic-markdown.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/parsers/generic-markdown.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the parser**

Create `src/lib/parsers/generic-markdown.ts`:

```ts
import type { ParserProfile, ParsedPlan, PlanPhase, PlanTask, PhaseStatus } from "@/lib/types";

function deriveStatus(tasks: PlanTask[]): PhaseStatus {
  if (tasks.length === 0) return "not_started";
  const doneCount = tasks.filter((t) => t.done).length;
  if (doneCount === tasks.length) return "completed";
  if (doneCount > 0) return "in_progress";
  return "not_started";
}

export const genericMarkdownProfile: ParserProfile = {
  name: "generic-markdown",

  detect(content: string): boolean {
    const hasH2 = /^## .+/m.test(content);
    const hasChecklist = /^- \[(x| )\] .+/m.test(content);
    return hasH2 && hasChecklist;
  },

  parse(content: string): ParsedPlan {
    const lines = content.split("\n");

    // Extract title from first H1
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled Plan";

    const phases: PlanPhase[] = [];
    let currentPhase: PlanPhase | null = null;

    for (const line of lines) {
      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) {
        if (currentPhase) {
          currentPhase.status = deriveStatus(currentPhase.tasks);
          phases.push(currentPhase);
        }
        currentPhase = {
          name: h2Match[1].trim(),
          status: "not_started",
          tasks: [],
        };
        continue;
      }

      const taskMatch = line.match(/^- \[(x| )\] (.+)$/);
      if (taskMatch && currentPhase) {
        currentPhase.tasks.push({
          done: taskMatch[1] === "x",
          text: taskMatch[2].trim(),
        });
      }
    }

    // Push last phase
    if (currentPhase) {
      currentPhase.status = deriveStatus(currentPhase.tasks);
      phases.push(currentPhase);
    }

    return { title, format: "generic-markdown", phases };
  },
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/parsers/generic-markdown.test.ts`
Expected: All 8 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/parsers/
git commit -m "feat: add generic-markdown spec parser profile"
```

---

## Task 7: Parser Registry & Auto-Detection

**Files:**
- Create: `src/lib/parsers/index.ts`
- Test: `src/lib/parsers/registry.test.ts`

**Step 1: Write the failing test**

Create `src/lib/parsers/registry.test.ts`:

```ts
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
      parse: (content) => ({
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/parsers/registry.test.ts`
Expected: FAIL — functions not found.

**Step 3: Write the registry**

Create `src/lib/parsers/index.ts`:

```ts
import type { ParserProfile, ParsedPlan } from "@/lib/types";
import { genericMarkdownProfile } from "./generic-markdown";

const profiles: ParserProfile[] = [genericMarkdownProfile];

export function registerProfile(profile: ParserProfile): void {
  // Insert before generic-markdown (which should always be last as fallback)
  const genericIdx = profiles.findIndex((p) => p.name === "generic-markdown");
  if (genericIdx >= 0) {
    profiles.splice(genericIdx, 0, profile);
  } else {
    profiles.push(profile);
  }
}

export function getProfileNames(): string[] {
  return profiles.map((p) => p.name);
}

function detectFromFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const frameworkMatch = frontmatter.match(/^(?:framework|generator):\s*(.+)$/m);
  return frameworkMatch ? frameworkMatch[1].trim() : null;
}

export function detectAndParse(content: string): ParsedPlan | null {
  // 1. Check frontmatter for explicit framework declaration
  const declared = detectFromFrontmatter(content);
  if (declared) {
    const profile = profiles.find((p) => p.name === declared);
    if (profile) {
      return profile.parse(content);
    }
  }

  // 2. Try each profile's detect method
  for (const profile of profiles) {
    if (profile.detect(content)) {
      return profile.parse(content);
    }
  }

  // 3. No match
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/parsers/registry.test.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/parsers/
git commit -m "feat: add parser registry with auto-detection and frontmatter support"
```

---

## Task 8: Plans API

**Files:**
- Create: `src/app/api/plans/[projectId]/route.ts`
- Test: `src/app/api/plans/plans.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/plans/plans.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/plans/plans.test.ts`
Expected: FAIL initially, then should pass once wired.

**Step 3: Write the API route**

Create `src/app/api/plans/[projectId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const db = getDatabase();

  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const plans = db.select().from(schema.plans).where(eq(schema.plans.projectId, projectId)).all();

  return NextResponse.json(
    plans.map((plan) => ({
      ...plan,
      phases: typeof plan.phases === "string" ? JSON.parse(plan.phases) : plan.phases,
    }))
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/plans/plans.test.ts`
Expected: All 2 tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/plans/
git commit -m "feat: add plans API route (GET by project)"
```

---

## Task 9: Attention Engine

**Files:**
- Create: `src/lib/attention.ts`
- Test: `src/lib/attention.test.ts`

**Step 1: Write the failing test**

Create `src/lib/attention.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/attention.test.ts`
Expected: FAIL — functions not found.

**Step 3: Write the attention engine**

Create `src/lib/attention.ts`:

```ts
import * as schema from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { AttentionType } from "./types";

type Db = any; // Drizzle db instance type

interface CreateAttentionInput {
  projectId: string;
  planId?: string;
  type: AttentionType;
  title: string;
  detail?: string;
  priority: number;
  sourceUrl?: string;
}

export function createAttentionItem(db: Db, input: CreateAttentionInput) {
  // Check for existing active item of same type for same project
  const existing = db
    .select()
    .from(schema.attentionItems)
    .where(
      and(
        eq(schema.attentionItems.projectId, input.projectId),
        eq(schema.attentionItems.type, input.type),
        isNull(schema.attentionItems.resolvedAt)
      )
    )
    .get();

  if (existing) {
    return existing;
  }

  const item = {
    id: uuid(),
    projectId: input.projectId,
    planId: input.planId ?? null,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    priority: input.priority,
    sourceUrl: input.sourceUrl ?? null,
    resolvedAt: null,
  };

  db.insert(schema.attentionItems).values(item).run();

  return db
    .select()
    .from(schema.attentionItems)
    .where(eq(schema.attentionItems.id, item.id))
    .get();
}

export function resolveAttentionItem(db: Db, itemId: string): void {
  db.update(schema.attentionItems)
    .set({ resolvedAt: new Date().toISOString() })
    .where(eq(schema.attentionItems.id, itemId))
    .run();
}

export function autoResolveByCondition(
  db: Db,
  projectId: string,
  type: AttentionType
): void {
  db.update(schema.attentionItems)
    .set({ resolvedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.attentionItems.projectId, projectId),
        eq(schema.attentionItems.type, type),
        isNull(schema.attentionItems.resolvedAt)
      )
    )
    .run();
}

export function getActiveItems(db: Db, projectId?: string) {
  const conditions = [isNull(schema.attentionItems.resolvedAt)];
  if (projectId) {
    conditions.push(eq(schema.attentionItems.projectId, projectId));
  }

  return db
    .select()
    .from(schema.attentionItems)
    .where(and(...conditions))
    .orderBy(desc(schema.attentionItems.priority), desc(schema.attentionItems.createdAt))
    .all();
}

export function getResolvedItems(db: Db, limit = 50) {
  return db
    .select()
    .from(schema.attentionItems)
    .where(
      and(
        eq(schema.attentionItems.resolvedAt, schema.attentionItems.resolvedAt) // not null - workaround
      )
    )
    .orderBy(desc(schema.attentionItems.resolvedAt))
    .limit(limit)
    .all();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/attention.test.ts`
Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/attention.ts src/lib/attention.test.ts
git commit -m "feat: add attention engine with create, resolve, auto-resolve, dedup"
```

---

## Task 10: Attention API

**Files:**
- Create: `src/app/api/attention/route.ts`, `src/app/api/attention/[id]/resolve/route.ts`
- Test: `src/app/api/attention/attention-api.test.ts`

**Step 1: Write the failing test**

Create `src/app/api/attention/attention-api.test.ts`:

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/attention/attention-api.test.ts`
Expected: Should PASS (tests use existing attention functions). If path resolution fails, fix vitest alias.

**Step 3: Write the API routes**

Create `src/app/api/attention/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { getActiveItems } from "@/lib/attention";
import { attentionFilterSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filters = attentionFilterSchema.safeParse({
    type: searchParams.get("type") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    resolved: searchParams.has("resolved") ? searchParams.get("resolved") === "true" : undefined,
  });

  if (!filters.success) {
    return NextResponse.json({ error: filters.error.flatten() }, { status: 400 });
  }

  const db = getDatabase();
  let items = getActiveItems(db, filters.data.projectId);

  if (filters.data.type) {
    items = items.filter((item: any) => item.type === filters.data.type);
  }

  return NextResponse.json(items);
}
```

Create `src/app/api/attention/[id]/resolve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import { resolveAttentionItem } from "@/lib/attention";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDatabase();

  const item = db.select().from(schema.attentionItems).where(eq(schema.attentionItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  resolveAttentionItem(db, id);
  return NextResponse.json({ resolved: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/attention/attention-api.test.ts`
Expected: All 2 tests PASS.

**Step 5: Commit**

```bash
git add src/app/api/attention/
git commit -m "feat: add attention API routes (GET with filters, POST resolve)"
```

---

## Task 11: Sync Engine

**Files:**
- Create: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

**Step 1: Write the failing test**

Create `src/lib/sync.test.ts`:

```ts
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
    expect(items.some((i) => i.type === "checks_failing")).toBe(true);
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
    expect(items.some((i) => i.type === "pr_needs_review")).toBe(true);
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
    expect(getActiveItems(db).some((i) => i.type === "checks_failing")).toBe(true);

    // Second sync: checks pass
    mockGithub.listOpenPRs.mockResolvedValueOnce([
      { number: 1, title: "PR", htmlUrl: "url", requestedReviewers: [], draft: false, headSha: "abc" },
    ]);
    mockGithub.getCheckRuns.mockResolvedValueOnce([
      { name: "test", status: "completed", conclusion: "success" },
    ]);
    await syncProject(db, projectId, mockGithub as any);
    expect(getActiveItems(db).some((i) => i.type === "checks_failing")).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync.test.ts`
Expected: FAIL — `syncProject` not found.

**Step 3: Write the sync engine**

Create `src/lib/sync.ts`:

```ts
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAttentionItem, autoResolveByCondition } from "./attention";
import { detectAndParse } from "./parsers";
import { createHash } from "crypto";
import type { GitHubClient } from "./github";
import { v4 as uuid } from "uuid";

type Db = any;

function extractOwnerRepo(githubUrl: string): { owner: string; repo: string } | null {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function syncProject(db: Db, projectId: string, github: GitHubClient): Promise<void> {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project || !project.isTracked) return;

  // Sync GitHub data if project has a GitHub URL
  if (project.githubUrl) {
    const parsed = extractOwnerRepo(project.githubUrl);
    if (parsed) {
      await syncGitHubPRs(db, project, parsed.owner, parsed.repo, github);
      await syncGitHubPlans(db, project, parsed.owner, parsed.repo, github);
    }
  }

  // Update last synced timestamp
  db.update(schema.projects)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, projectId))
    .run();
}

async function syncGitHubPRs(
  db: Db,
  project: any,
  owner: string,
  repo: string,
  github: GitHubClient
): Promise<void> {
  const prs = await github.listOpenPRs(owner, repo);

  let hasFailingChecks = false;
  let hasReviewRequests = false;

  for (const pr of prs) {
    if (pr.draft) continue;

    // Check for review requests
    if (pr.requestedReviewers.length > 0) {
      hasReviewRequests = true;
      createAttentionItem(db, {
        projectId: project.id,
        type: "pr_needs_review",
        title: `PR #${pr.number}: ${pr.title}`,
        priority: 4,
        sourceUrl: pr.htmlUrl,
      });
    }

    // Check CI status
    if ((pr as any).headSha) {
      const checks = await github.getCheckRuns(owner, repo, (pr as any).headSha);
      const hasFailing = checks.some(
        (c) => c.status === "completed" && c.conclusion === "failure"
      );

      if (hasFailing) {
        hasFailingChecks = true;
        createAttentionItem(db, {
          projectId: project.id,
          type: "checks_failing",
          title: `Checks failing on PR #${pr.number}: ${pr.title}`,
          priority: 5,
          sourceUrl: pr.htmlUrl,
        });
      }

      const allPassing = checks.length > 0 && checks.every(
        (c) => c.status === "completed" && c.conclusion === "success"
      );
      if (allPassing && !pr.requestedReviewers.length) {
        createAttentionItem(db, {
          projectId: project.id,
          type: "pr_merge_ready",
          title: `PR #${pr.number} ready to merge: ${pr.title}`,
          priority: 3,
          sourceUrl: pr.htmlUrl,
        });
      }
    }
  }

  // Auto-resolve if conditions cleared
  if (!hasFailingChecks) {
    autoResolveByCondition(db, project.id, "checks_failing");
  }
  if (!hasReviewRequests) {
    autoResolveByCondition(db, project.id, "pr_needs_review");
  }
  if (prs.length === 0) {
    autoResolveByCondition(db, project.id, "pr_merge_ready");
  }
}

async function syncGitHubPlans(
  db: Db,
  project: any,
  owner: string,
  repo: string,
  github: GitHubClient
): Promise<void> {
  const files = await github.listDirectoryContents(owner, repo, "docs/plans");

  for (const filePath of files) {
    if (!filePath.endsWith(".md")) continue;

    const fileData = await github.getFileContent(owner, repo, filePath);
    if (!fileData) continue;

    const newHash = hashContent(fileData.content);
    const existingPlan = db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.filePath, filePath))
      .get();

    if (existingPlan && existingPlan.fileHash === newHash) {
      continue; // No changes
    }

    const parsed = detectAndParse(fileData.content);
    if (!parsed) continue;

    if (existingPlan) {
      // Update existing plan
      db.update(schema.plans)
        .set({
          title: parsed.title,
          format: parsed.format,
          phases: JSON.stringify(parsed.phases),
          fileHash: newHash,
          parsedAt: new Date().toISOString(),
        })
        .where(eq(schema.plans.id, existingPlan.id))
        .run();

      createAttentionItem(db, {
        projectId: project.id,
        planId: existingPlan.id,
        type: "plan_changed",
        title: `Plan updated: ${parsed.title}`,
        priority: 2,
      });
    } else {
      // Insert new plan
      const planId = uuid();
      db.insert(schema.plans)
        .values({
          id: planId,
          projectId: project.id,
          filePath,
          title: parsed.title,
          format: parsed.format,
          phases: JSON.stringify(parsed.phases),
          fileHash: newHash,
        })
        .run();
    }
  }
}

export async function syncAllProjects(db: Db, github: GitHubClient): Promise<void> {
  const tracked = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.isTracked, true))
    .all();

  for (const project of tracked) {
    try {
      await syncProject(db, project.id, github);
    } catch (error) {
      console.error(`Sync failed for ${project.name}:`, error);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sync.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: add sync engine for GitHub PRs, checks, and plan parsing"
```

---

## Task 12: Sync API & Scheduler

**Files:**
- Create: `src/app/api/sync/route.ts`, `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Step 1: Write the failing test**

Create `src/lib/scheduler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncScheduler } from "./scheduler";

describe("SyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls sync function on interval", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    scheduler.start();
    vi.advanceTimersByTime(3500);

    expect(syncFn).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it("stops calling after stop()", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    scheduler.start();
    vi.advanceTimersByTime(2500);
    scheduler.stop();
    vi.advanceTimersByTime(2000);

    expect(syncFn).toHaveBeenCalledTimes(2);
  });

  it("reports running state", () => {
    const syncFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new SyncScheduler(syncFn, 1000);

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: FAIL — `SyncScheduler` not found.

**Step 3: Write the scheduler**

Create `src/lib/scheduler.ts`:

```ts
export class SyncScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private syncFn: () => Promise<void>;
  private intervalMs: number;

  constructor(syncFn: () => Promise<void>, intervalMs: number) {
    this.syncFn = syncFn;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(async () => {
      try {
        await this.syncFn();
      } catch (error) {
        console.error("Sync error:", error);
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
```

**Step 4: Write the sync API route**

Create `src/app/api/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { syncAllProjects } from "@/lib/sync";
import { GitHubClient } from "@/lib/github";

export async function POST() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return NextResponse.json({ error: "GitHub PAT not configured" }, { status: 500 });
  }

  const db = getDatabase();
  const github = new GitHubClient(token);

  try {
    await syncAllProjects(db, github);
    return NextResponse.json({ synced: true, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/scheduler.test.ts`
Expected: All 3 tests PASS.

**Step 6: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts src/app/api/sync/
git commit -m "feat: add sync scheduler and manual sync API endpoint"
```

---

## Task 13: Install shadcn/ui & App Layout

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/components/layout/sidebar.tsx`, `src/components/layout/header.tsx`

**Step 1: Install shadcn/ui**

Run:
```bash
npx shadcn@latest init
```

Follow prompts: TypeScript, default style, default color, CSS variables.

**Step 2: Add required components**

Run:
```bash
npx shadcn@latest add button card badge tabs separator scroll-area input label switch
```

**Step 3: Create sidebar navigation**

Create `src/components/layout/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Inbox", icon: "inbox" },
  { href: "/projects", label: "Projects", icon: "folder" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-muted/30 p-4 flex flex-col gap-1">
      <div className="mb-6 px-2">
        <h1 className="text-lg font-semibold">DesignFlow</h1>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-3 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 4: Create header**

Create `src/components/layout/header.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function Header() {
  const handleSync = async () => {
    await fetch("/api/sync", { method: "POST" });
  };

  return (
    <header className="h-14 border-b px-6 flex items-center justify-between">
      <div />
      <Button variant="outline" size="sm" onClick={handleSync}>
        Sync now
      </Button>
    </header>
  );
}
```

**Step 5: Update layout**

Modify `src/app/layout.tsx` to include sidebar and header:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DesignFlow",
  description: "Attention-driven development workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
```

**Step 6: Verify it renders**

Run: `npm run dev`
Expected: App renders with sidebar (Inbox, Projects, Settings) and header with Sync button.

**Step 7: Commit**

```bash
git add src/components/ src/app/layout.tsx src/app/globals.css
git commit -m "feat: add app shell with sidebar navigation and header"
```

---

## Task 14: Inbox View

**Files:**
- Create: `src/app/page.tsx` (replace), `src/components/inbox/attention-item-card.tsx`, `src/components/inbox/inbox-filters.tsx`

**Step 1: Create attention item card**

Create `src/components/inbox/attention-item-card.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AttentionItemProps {
  item: {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    priority: number;
    sourceUrl: string | null;
    projectName?: string;
    createdAt: string;
  };
  onResolve: (id: string) => void;
}

const priorityColors: Record<number, string> = {
  5: "bg-red-500",
  4: "bg-orange-500",
  3: "bg-yellow-500",
  2: "bg-blue-500",
  1: "bg-gray-400",
};

const typeLabels: Record<string, string> = {
  pr_needs_review: "PR Review",
  checks_failing: "Checks Failing",
  pr_merge_ready: "Merge Ready",
  plan_changed: "Plan Changed",
  phase_blocked: "Phase Blocked",
  new_project: "New Project",
  stale_project: "Stale",
};

export function AttentionItemCard({ item, onResolve }: AttentionItemProps) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full mt-2 ${priorityColors[item.priority] ?? "bg-gray-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {typeLabels[item.type] ?? item.type}
          </Badge>
          {item.projectName && (
            <span className="text-xs text-muted-foreground">{item.projectName}</span>
          )}
        </div>
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {item.sourceUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => onResolve(item.id)}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
```

**Step 2: Create inbox filters**

Create `src/components/inbox/inbox-filters.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

const filterOptions = [
  { value: undefined, label: "All" },
  { value: "pr_needs_review", label: "PR Reviews" },
  { value: "checks_failing", label: "Failing Checks" },
  { value: "pr_merge_ready", label: "Merge Ready" },
  { value: "plan_changed", label: "Plan Changes" },
];

interface InboxFiltersProps {
  activeFilter?: string;
  onFilterChange: (filter?: string) => void;
}

export function InboxFilters({ activeFilter, onFilterChange }: InboxFiltersProps) {
  return (
    <div className="flex gap-2 mb-4">
      {filterOptions.map((option) => (
        <Button
          key={option.label}
          variant={activeFilter === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
```

**Step 3: Build the inbox page**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { AttentionItemCard } from "@/components/inbox/attention-item-card";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AttentionItem {
  id: string;
  projectId: string;
  type: string;
  title: string;
  detail: string | null;
  priority: number;
  sourceUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function InboxPage() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [filter, setFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter) params.set("type", filter);

    const res = await fetch(`/api/attention?${params}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleResolve = async (id: string) => {
    await fetch(`/api/attention/${id}/resolve`, { method: "POST" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Inbox</h2>
      <InboxFilters activeFilter={filter} onFilterChange={setFilter} />

      {items.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-center">
          Nothing needs your attention right now.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <AttentionItemCard key={item.id} item={item} onResolve={handleResolve} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify it renders**

Run: `npm run dev`
Expected: Inbox page renders with filters and empty state message.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/components/inbox/
git commit -m "feat: add inbox view with attention items, filters, and dismiss"
```

---

## Task 15: Projects List View

**Files:**
- Create: `src/app/projects/page.tsx`, `src/components/projects/project-card.tsx`

**Step 1: Create project card**

Create `src/components/projects/project-card.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    isTracked: boolean;
    lastSyncedAt: string | null;
    attentionCount?: number;
    currentPhase?: string;
    status?: "needs_attention" | "on_track" | "stale";
  };
}

const statusConfig = {
  needs_attention: { label: "Needs attention", variant: "destructive" as const },
  on_track: { label: "On track", variant: "default" as const },
  stale: { label: "Stale", variant: "secondary" as const },
};

export function ProjectCard({ project }: ProjectCardProps) {
  const status = project.status ?? "on_track";
  const config = statusConfig[status];

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium">{project.name}</h3>
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        {project.currentPhase && (
          <p className="text-sm text-muted-foreground mb-1">{project.currentPhase}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {project.attentionCount !== undefined && project.attentionCount > 0 && (
            <span>{project.attentionCount} item{project.attentionCount !== 1 ? "s" : ""}</span>
          )}
          {project.lastSyncedAt && (
            <span>Synced {new Date(project.lastSyncedAt).toLocaleDateString()}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
```

**Step 2: Build the projects list page**

Create `src/app/projects/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ProjectCard } from "@/components/projects/project-card";

interface Project {
  id: string;
  name: string;
  githubUrl: string | null;
  localPath: string | null;
  source: string;
  isTracked: boolean;
  lastSyncedAt: string | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const tracked = projects.filter((p) => p.isTracked);
  const untracked = projects.filter((p) => !p.isTracked);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Projects</h2>

      {tracked.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Tracked</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tracked.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {untracked.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Available</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {untracked.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <p className="text-muted-foreground mt-8 text-center">
          No projects yet. Configure your GitHub PAT in Settings to discover repos.
        </p>
      )}
    </div>
  );
}
```

**Step 3: Verify it renders**

Run: `npm run dev`, navigate to `/projects`.
Expected: Projects page renders with tracked/untracked sections or empty state.

**Step 4: Commit**

```bash
git add src/app/projects/ src/components/projects/
git commit -m "feat: add projects list view with tracked/untracked sections"
```

---

## Task 16: Project Detail View

**Files:**
- Create: `src/app/projects/[id]/page.tsx`, `src/components/projects/plan-progress.tsx`, `src/components/projects/project-activity.tsx`

**Step 1: Create plan progress component**

Create `src/components/projects/plan-progress.tsx`:

```tsx
interface PlanPhase {
  name: string;
  status: string;
  tasks: { text: string; done: boolean }[];
}

interface Plan {
  id: string;
  title: string;
  format: string;
  phases: PlanPhase[];
}

interface PlanProgressProps {
  plans: Plan[];
}

export function PlanProgress({ plans }: PlanProgressProps) {
  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">No plans found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {plans.map((plan) => (
        <div key={plan.id}>
          <h4 className="font-medium mb-3">{plan.title}</h4>
          <div className="flex flex-col gap-2">
            {plan.phases.map((phase, idx) => {
              const total = phase.tasks.length;
              const done = phase.tasks.filter((t) => t.done).length;
              const isCurrent = phase.status === "in_progress";

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-md border text-sm ${
                    isCurrent ? "border-primary bg-primary/5" : ""
                  } ${phase.status === "completed" ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={isCurrent ? "font-medium" : ""}>{phase.name}</span>
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {done}/{total}
                      </span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Create project activity component**

Create `src/components/projects/project-activity.tsx`:

```tsx
import { AttentionItemCard } from "@/components/inbox/attention-item-card";

interface ProjectActivityProps {
  items: any[];
  onResolve: (id: string) => void;
}

export function ProjectActivity({ items, onResolve }: ProjectActivityProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No active items.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <AttentionItemCard key={item.id} item={item} onResolve={onResolve} />
      ))}
    </div>
  );
}
```

**Step 3: Build the detail page**

Create `src/app/projects/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanProgress } from "@/components/projects/plan-progress";
import { ProjectActivity } from "@/components/projects/project-activity";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [projRes, plansRes, itemsRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/plans/${id}`),
        fetch(`/api/attention?projectId=${id}`),
      ]);

      setProject(await projRes.json());
      setPlans(await plansRes.json());
      setItems(await itemsRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

  const handleResolve = async (itemId: string) => {
    await fetch(`/api/attention/${itemId}/resolve`, { method: "POST" });
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  if (loading || !project) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const statusLabel = items.some((i) => i.priority >= 4)
    ? "Needs attention"
    : items.length > 0
      ? "On track"
      : "Clear";

  const statusVariant = items.some((i) => i.priority >= 4)
    ? "destructive"
    : items.length > 0
      ? "default"
      : "secondary";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariant as any}>{statusLabel}</Badge>
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline"
              >
                GitHub
              </a>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetch("/api/sync", { method: "POST" })}>
          Sync
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Plan Progress</h3>
          <PlanProgress plans={plans} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Attention</h3>
          <ProjectActivity items={items} onResolve={handleResolve} />
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Verify it renders**

Run: `npm run dev`, navigate to `/projects/<some-id>`.
Expected: Detail page renders with plan progress (left) and attention items (right).

**Step 5: Commit**

```bash
git add src/app/projects/\[id\]/ src/components/projects/
git commit -m "feat: add project detail view with plan progress and attention panels"
```

---

## Task 17: Settings View

**Files:**
- Create: `src/app/settings/page.tsx`, `src/app/api/settings/route.ts`

**Step 1: Write settings API**

Create `src/app/api/settings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const db = getDatabase();
  const rows = db.select().from(schema.settings).all();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getDatabase();

  for (const [key, value] of Object.entries(body)) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (existing) {
      db.update(schema.settings).set({ value: String(value) }).where(eq(schema.settings.key, key)).run();
    } else {
      db.insert(schema.settings).values({ key, value: String(value) }).run();
    }
  }

  return NextResponse.json({ updated: true });
}
```

**Step 2: Build settings page**

Create `src/app/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  const [githubPat, setGithubPat] = useState("");
  const [syncInterval, setSyncInterval] = useState("180000");
  const [notifThreshold, setNotifThreshold] = useState("4");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.github_pat) setGithubPat(data.github_pat);
      if (data.sync_interval_ms) setSyncInterval(data.sync_interval_ms);
      if (data.notification_priority_threshold) setNotifThreshold(data.notification_priority_threshold);
    }
    load();
  }, []);

  const handleSave = async () => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        github_pat: githubPat,
        sync_interval_ms: syncInterval,
        notification_priority_threshold: notifThreshold,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">GitHub Connection</h3>
        <div className="space-y-2">
          <Label htmlFor="pat">Personal Access Token</Label>
          <Input
            id="pat"
            type="password"
            value={githubPat}
            onChange={(e) => setGithubPat(e.target.value)}
            placeholder="ghp_..."
          />
          <p className="text-xs text-muted-foreground">
            Requires <code>repo</code> scope for read access.
          </p>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">Sync</h3>
        <div className="space-y-2">
          <Label htmlFor="interval">Sync interval (ms)</Label>
          <Input
            id="interval"
            type="number"
            value={syncInterval}
            onChange={(e) => setSyncInterval(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Default: 180000 (3 minutes)
          </p>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h3 className="font-medium mb-4">Notifications</h3>
        <div className="space-y-2">
          <Label htmlFor="threshold">Minimum priority for macOS notifications</Label>
          <Input
            id="threshold"
            type="number"
            min="1"
            max="5"
            value={notifThreshold}
            onChange={(e) => setNotifThreshold(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            1 = all items, 5 = critical only. Default: 4
          </p>
        </div>
      </Card>

      <Button onClick={handleSave}>
        {saved ? "Saved" : "Save settings"}
      </Button>
    </div>
  );
}
```

**Step 3: Verify it renders**

Run: `npm run dev`, navigate to `/settings`.
Expected: Settings form renders with GitHub PAT, sync interval, notification threshold.

**Step 4: Commit**

```bash
git add src/app/settings/ src/app/api/settings/
git commit -m "feat: add settings view and API for GitHub PAT, sync, notifications"
```

---

## Task 18: Notifications

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `src/lib/notifications.test.ts`

**Step 1: Write the failing test**

Create `src/lib/notifications.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { shouldNotify, formatNotification } from "./notifications";

describe("notifications", () => {
  it("returns true for items at or above threshold", () => {
    expect(shouldNotify({ priority: 5 }, 4)).toBe(true);
    expect(shouldNotify({ priority: 4 }, 4)).toBe(true);
  });

  it("returns false for items below threshold", () => {
    expect(shouldNotify({ priority: 3 }, 4)).toBe(false);
    expect(shouldNotify({ priority: 1 }, 4)).toBe(false);
  });

  it("formats notification correctly", () => {
    const result = formatNotification({
      type: "checks_failing",
      title: "CI failing on PR #5",
      projectName: "my-project",
    });

    expect(result.title).toBe("DesignFlow: my-project");
    expect(result.message).toBe("CI failing on PR #5");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: FAIL — functions not found.

**Step 3: Write the notifications module**

Create `src/lib/notifications.ts`:

```ts
import notifier from "node-notifier";

interface NotifiableItem {
  priority: number;
}

interface FormattableItem {
  type: string;
  title: string;
  projectName: string;
}

export function shouldNotify(item: NotifiableItem, threshold: number): boolean {
  return item.priority >= threshold;
}

export function formatNotification(item: FormattableItem): { title: string; message: string } {
  return {
    title: `DesignFlow: ${item.projectName}`,
    message: item.title,
  };
}

export function sendMacNotification(title: string, message: string, url?: string): void {
  notifier.notify({
    title,
    message,
    sound: true,
    open: url,
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "feat: add notification helpers with threshold filtering and macOS support"
```

---

## Task 19: Wire Notifications Into Sync Engine

**Files:**
- Modify: `src/lib/sync.ts`

**Step 1: Update sync to fire notifications on new high-priority items**

In `src/lib/sync.ts`, import notification helpers and add a `notify` option to `syncProject`. After each `createAttentionItem` call, check if the item is new (not a dedup return) and if it passes the threshold:

Add to top of `src/lib/sync.ts`:
```ts
import { shouldNotify, formatNotification, sendMacNotification } from "./notifications";
```

Add a notification helper at the bottom of `syncProject`:

```ts
// In the createAttentionItem calls, capture the return value and check:
// if newly created (createdAt is recent), fire notification
```

The key logic: after `createAttentionItem` returns, compare `item.createdAt` to "just now" (within 5 seconds). If new and priority >= threshold, call `sendMacNotification`.

This is a lightweight wiring change — the notification module does the heavy lifting.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. Notification tests remain unit-level (no actual macOS notifications in CI).

**Step 3: Commit**

```bash
git add src/lib/sync.ts
git commit -m "feat: wire macOS notifications into sync engine for high-priority items"
```

---

## Task 20: GitHub Repo Discovery API

**Files:**
- Create: `src/app/api/github/repos/route.ts`

**Step 1: Write the route**

Create `src/app/api/github/repos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { GitHubClient } from "@/lib/github";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

export async function POST() {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return NextResponse.json({ error: "GitHub PAT not configured" }, { status: 500 });
  }

  const db = getDatabase();
  const github = new GitHubClient(token);
  const repos = await github.listRepos();

  let added = 0;
  for (const repo of repos) {
    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.githubUrl, repo.htmlUrl))
      .get();

    if (!existing) {
      db.insert(schema.projects).values({
        id: uuid(),
        name: repo.name,
        githubUrl: repo.htmlUrl,
        source: "github_discovered",
        isTracked: false,
      }).run();
      added++;
    }
  }

  return NextResponse.json({ discovered: repos.length, added });
}
```

**Step 2: Verify manually**

Run: `npm run dev`, then `curl -X POST http://localhost:3000/api/github/repos`
Expected: JSON response with discovered/added counts (requires valid PAT in env).

**Step 3: Commit**

```bash
git add src/app/api/github/
git commit -m "feat: add GitHub repo discovery endpoint"
```

---

## Task 21: Integration Test — Full Sync Cycle

**Files:**
- Test: `src/lib/sync-integration.test.ts`

**Step 1: Write the integration test**

Create `src/lib/sync-integration.test.ts`:

```ts
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
    getFileContent: vi.fn().mockResolvedValue({
      content: specContent,
      sha: "filesha",
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
    expect(items.some((i) => i.type === "pr_needs_review")).toBe(true);

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
    mockGithub.getFileContent.mockResolvedValueOnce({
      content: updatedContent,
      sha: "newsha",
    });

    await syncProject(db, projectId, mockGithub as any);

    const items = getActiveItems(db);
    expect(items.some((i) => i.type === "plan_changed")).toBe(true);
  });
});
```

**Step 2: Run the integration test**

Run: `npx vitest run src/lib/sync-integration.test.ts`
Expected: All 2 tests PASS.

**Step 3: Commit**

```bash
git add src/lib/sync-integration.test.ts
git commit -m "test: add full sync cycle integration tests"
```

---

## Task 22: Final Wiring — App Startup & Scheduler Init

**Files:**
- Create: `src/lib/startup.ts`
- Modify: `src/app/layout.tsx`

**Step 1: Create startup module**

Create `src/lib/startup.ts`:

```ts
import { getDatabase } from "@/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { SyncScheduler } from "./scheduler";
import { syncAllProjects } from "./sync";
import { GitHubClient } from "./github";

let scheduler: SyncScheduler | null = null;

export function initializeApp(): void {
  const db = getDatabase();

  // Run migrations
  migrate(db, { migrationsFolder: "./drizzle" });

  // Start sync scheduler if PAT is configured
  const token = process.env.GITHUB_PAT;
  if (token) {
    const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS ?? "180000", 10);
    const github = new GitHubClient(token);

    scheduler = new SyncScheduler(async () => {
      await syncAllProjects(db, github);
    }, intervalMs);

    scheduler.start();
    console.log(`Sync scheduler started (interval: ${intervalMs}ms)`);
  } else {
    console.log("No GITHUB_PAT set — sync scheduler not started");
  }
}

export function getScheduler(): SyncScheduler | null {
  return scheduler;
}
```

**Step 2: Wire into Next.js instrumentation**

Create `src/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeApp } = await import("@/lib/startup");
    initializeApp();
  }
}
```

**Step 3: Enable instrumentation in next.config**

In `next.config.ts`, ensure `experimental.instrumentationHook` is enabled (Next.js 14+):

```ts
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};
export default nextConfig;
```

**Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

**Step 5: Run the dev server end-to-end**

Run: `npm run dev`
Expected: Console shows "Sync scheduler started" (if PAT set) or "No GITHUB_PAT set". App loads at localhost:3000 with Inbox, Projects, Settings all functional.

**Step 6: Commit**

```bash
git add src/lib/startup.ts src/instrumentation.ts next.config.ts
git commit -m "feat: add app startup with migration and sync scheduler initialization"
```

---

## Summary

| Task | Description | Key Files |
|------|------------|-----------|
| 1 | Project scaffolding | package.json, vitest.config.ts |
| 2 | Database schema | src/db/schema.ts, drizzle/ |
| 3 | Shared types & validation | src/lib/types.ts, validators.ts |
| 4 | Projects API | src/app/api/projects/ |
| 5 | GitHub client | src/lib/github.ts |
| 6 | Generic markdown parser | src/lib/parsers/generic-markdown.ts |
| 7 | Parser registry | src/lib/parsers/index.ts |
| 8 | Plans API | src/app/api/plans/ |
| 9 | Attention engine | src/lib/attention.ts |
| 10 | Attention API | src/app/api/attention/ |
| 11 | Sync engine | src/lib/sync.ts |
| 12 | Sync scheduler & API | src/lib/scheduler.ts, api/sync/ |
| 13 | App layout & navigation | components/layout/ |
| 14 | Inbox view | src/app/page.tsx, components/inbox/ |
| 15 | Projects list view | src/app/projects/ |
| 16 | Project detail view | src/app/projects/[id]/ |
| 17 | Settings view | src/app/settings/ |
| 18 | Notifications | src/lib/notifications.ts |
| 19 | Wire notifications into sync | src/lib/sync.ts |
| 20 | GitHub repo discovery | src/app/api/github/repos/ |
| 21 | Integration tests | src/lib/sync-integration.test.ts |
| 22 | App startup & scheduler | src/lib/startup.ts, instrumentation.ts |

**Total: 22 tasks, ~88 steps, ~22 commits**

After Task 22, you will have a fully functional DesignFlow app with:
- Inbox with prioritized attention items
- Project tracking with GitHub discovery
- Adaptive spec parsing (generic-markdown, extensible)
- Background sync on configurable interval
- macOS notifications for high-priority items
- Settings for PAT, sync, and notification config

**Next steps (not in this plan):**
- Add SuperPowers, OpenSpec, SpecKit, BMAD parser profiles (requires sample output from each)
- Local folder watching for non-GitHub projects
- Staleness detection
- Polish UI styling
