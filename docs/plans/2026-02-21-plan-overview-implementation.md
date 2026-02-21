# Plan Overview Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat 51-item plan list with a spec-grouped, PR-aware overview featuring collapsible shipped sections, a spec detail drawer, and a recently-shipped activity feed.

**Architecture:** Add a `pull_requests` DB table synced alongside PRs. Frontend groups plans by `specs/NNN-name/` directory prefix, derives shipping status from merged PRs, and renders spec rows with collapse/expand. The home page gains a recently-shipped feed.

**Tech Stack:** Next.js 16, Drizzle ORM + SQLite, shadcn/ui (Sheet, Collapsible), Vitest, Octokit

**Design doc:** `docs/plans/2026-02-21-plan-overview-redesign.md`

---

## Task 1: Add `pull_requests` to schema + generate migration

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `drizzle/0001_pull_requests.sql` (auto-created by drizzle-kit)

**Step 1: Add the table to `src/db/schema.ts`**

Append after the `settings` table:

```typescript
export const pullRequests = sqliteTable("pull_requests", {
  id: text("id").primaryKey(), // "${projectId}:${number}" — deterministic for upsert
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  branchRef: text("branch_ref").notNull(),
  specNumber: text("spec_number"), // extracted from branchRef, null if no match
  state: text("state").notNull(), // "open" | "merged" | "closed"
  mergedAt: text("merged_at"),
  htmlUrl: text("html_url").notNull(),
});
```

**Step 2: Generate the migration**

```bash
npm run db:generate
```

Expected: creates `drizzle/0001_<something>.sql` with `CREATE TABLE pull_requests`.

**Step 3: Verify the SQL looks right**

```bash
cat drizzle/0001_*.sql
```

Expected: `CREATE TABLE \`pull_requests\`` with all columns.

**Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add pull_requests table to schema"
```

---

## Task 2: Add `listMergedPRs` to GitHubClient

**Files:**
- Modify: `src/lib/github.ts`
- Test: `src/lib/github.test.ts`

**Step 1: Write the failing test**

Open `src/lib/github.test.ts`. Add after the existing tests:

```typescript
it("listMergedPRs returns closed merged PRs with head ref", async () => {
  const mockOctokit = {
    rest: {
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              number: 16,
              title: "Portfolio Management",
              html_url: "https://github.com/user/repo/pull/16",
              head: { ref: "016-portfolio-management" },
              state: "closed",
              merged_at: "2026-02-04T00:00:00Z",
            },
            {
              number: 17,
              title: "Bugfix",
              html_url: "https://github.com/user/repo/pull/17",
              head: { ref: "fix/some-bug" },
              state: "closed",
              merged_at: null, // closed but not merged
            },
          ],
        }),
      },
    },
  };

  const client = new GitHubClient("token");
  // @ts-expect-error mocking private octokit
  client["octokit"] = mockOctokit;

  const prs = await client.listMergedPRs("user", "repo");
  expect(prs).toHaveLength(2); // returns all closed, not just merged — sync filters
  expect(prs[0].headRef).toBe("016-portfolio-management");
  expect(prs[0].mergedAt).toBe("2026-02-04T00:00:00Z");
  expect(prs[1].mergedAt).toBeNull();
});
```

**Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/github.test.ts
```

Expected: FAIL — `client.listMergedPRs is not a function`

**Step 3: Add `GitHubPRSummary` type and `listMergedPRs` method**

In `src/lib/github.ts`, add the interface after `GitHubCheckRun`:

```typescript
export interface GitHubPRSummary {
  number: number;
  title: string;
  htmlUrl: string;
  headRef: string;
  state: string;
  mergedAt: string | null;
}
```

Add the method inside `GitHubClient`, after `listOpenPRs`:

```typescript
async listMergedPRs(owner: string, repo: string): Promise<GitHubPRSummary[]> {
  const { data } = await this.octokit.rest.pulls.list({
    owner,
    repo,
    state: "closed",
    per_page: 100,
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    htmlUrl: pr.html_url,
    headRef: pr.head.ref,
    state: pr.merged_at ? "merged" : "closed",
    mergedAt: pr.merged_at ?? null,
  }));
}
```

**Step 4: Run test to confirm it passes**

```bash
npx vitest run src/lib/github.test.ts
```

Expected: all tests PASS

**Step 5: Commit**

```bash
git add src/lib/github.ts src/lib/github.test.ts
git commit -m "feat: add listMergedPRs to GitHubClient"
```

---

## Task 3: Sync PRs into `pull_requests` table

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

**Step 1: Write the failing test**

In `src/lib/sync.test.ts`, add to the `mockGithub` object:

```typescript
listMergedPRs: vi.fn().mockResolvedValue([]),
```

Then add a new test:

```typescript
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
```

**Step 2: Run test to confirm it fails**

```bash
npx vitest run src/lib/sync.test.ts
```

Expected: FAIL — `schema.pullRequests` doesn't exist / table missing

**Step 3: Update `syncGitHubPRs` in `src/lib/sync.ts`**

Add the spec extractor at the top of the file, after the imports:

```typescript
function extractSpecNumber(branchRef: string): string | null {
  const m = branchRef.match(/\b(\d{3})-/);
  return m ? m[1] : null;
}
```

At the end of `syncGitHubPRs`, after the autoResolve calls, add:

```typescript
  // Upsert all PRs (open + merged) into pull_requests table
  const openPRSummaries = prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    htmlUrl: pr.htmlUrl,
    headRef: "",            // open PRs from old type don't have headRef — fetch separately below
    state: "open" as const,
    mergedAt: null,
  }));

  const mergedPRs = await github.listMergedPRs(owner, repo);
  const allPRs = [...mergedPRs];

  // Also upsert open PRs using data already fetched
  for (const pr of prs) {
    allPRs.push({
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.htmlUrl,
      headRef: "",
      state: "open",
      mergedAt: null,
    });
  }

  for (const pr of allPRs) {
    const id = `${project.id}:${pr.number}`;
    const specNumber = pr.headRef ? extractSpecNumber(pr.headRef) : null;
    db.insert(schema.pullRequests)
      .values({
        id,
        projectId: project.id,
        number: pr.number,
        title: pr.title,
        branchRef: pr.headRef,
        specNumber,
        state: pr.state,
        mergedAt: pr.mergedAt ?? null,
        htmlUrl: pr.htmlUrl,
      })
      .onConflictDoUpdate({
        target: schema.pullRequests.id,
        set: {
          title: pr.title,
          state: pr.state,
          mergedAt: pr.mergedAt ?? null,
        },
      })
      .run();
  }
```

Wait — `onConflictDoUpdate` may not be available in the version used here. Check the Drizzle docs — the pattern for better-sqlite3 is:

```typescript
db.insert(schema.pullRequests)
  .values({ id, projectId: project.id, number: pr.number, title: pr.title,
            branchRef: pr.headRef, specNumber, state: pr.state,
            mergedAt: pr.mergedAt ?? null, htmlUrl: pr.htmlUrl })
  .onConflictDoUpdate({
    target: schema.pullRequests.id,
    set: { title: pr.title, state: pr.state, mergedAt: pr.mergedAt ?? null },
  })
  .run();
```

If `onConflictDoUpdate` isn't available, use a manual check:

```typescript
const existing = db.select().from(schema.pullRequests)
  .where(eq(schema.pullRequests.id, id)).get();
if (existing) {
  db.update(schema.pullRequests)
    .set({ title: pr.title, state: pr.state, mergedAt: pr.mergedAt ?? null })
    .where(eq(schema.pullRequests.id, id)).run();
} else {
  db.insert(schema.pullRequests).values({
    id, projectId: project.id, number: pr.number, title: pr.title,
    branchRef: pr.headRef, specNumber, state: pr.state,
    mergedAt: pr.mergedAt ?? null, htmlUrl: pr.htmlUrl,
  }).run();
}
```

Also update the `mockGithub` in `src/lib/sync-integration.test.ts`:

```typescript
listMergedPRs: vi.fn().mockResolvedValue([]),
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/sync.test.ts src/lib/sync-integration.test.ts
```

Expected: all PASS

**Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts src/lib/sync-integration.test.ts
git commit -m "feat: sync PRs into pull_requests table with spec number extraction"
```

---

## Task 4: API routes for PRs and activity feed

**Files:**
- Create: `src/app/api/pull-requests/route.ts`
- Create: `src/app/api/activity/route.ts`

**Step 1: Create `src/app/api/pull-requests/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const db = getDatabase();
  const prs = db
    .select()
    .from(schema.pullRequests)
    .where(eq(schema.pullRequests.projectId, projectId))
    .orderBy(desc(schema.pullRequests.mergedAt))
    .all();

  return NextResponse.json(prs);
}
```

**Step 2: Create `src/app/api/activity/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import * as schema from "@/db/schema";
import { eq, desc, isNotNull, and } from "drizzle-orm";

export async function GET() {
  const db = getDatabase();

  const rows = db
    .select({
      id: schema.pullRequests.id,
      number: schema.pullRequests.number,
      title: schema.pullRequests.title,
      specNumber: schema.pullRequests.specNumber,
      mergedAt: schema.pullRequests.mergedAt,
      htmlUrl: schema.pullRequests.htmlUrl,
      projectId: schema.pullRequests.projectId,
      projectName: schema.projects.name,
    })
    .from(schema.pullRequests)
    .innerJoin(schema.projects, eq(schema.pullRequests.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.pullRequests.state, "merged"),
        isNotNull(schema.pullRequests.specNumber)
      )
    )
    .orderBy(desc(schema.pullRequests.mergedAt))
    .limit(20)
    .all();

  return NextResponse.json(rows);
}
```

**Step 3: Manually test both routes**

Run a sync first if you haven't:
```bash
curl -X POST http://localhost:3000/api/sync
```

Then:
```bash
curl "http://localhost:3000/api/pull-requests?projectId=d0025b50-671d-4828-8c9f-fafd0383d5cf" | python3 -m json.tool | head -30
curl http://localhost:3000/api/activity | python3 -m json.tool | head -30
```

Expected: array of PRs with `specNumber` field populated for spec branches.

**Step 4: Commit**

```bash
git add src/app/api/pull-requests/ src/app/api/activity/
git commit -m "feat: add /api/pull-requests and /api/activity routes"
```

---

## Task 5: Install shadcn Sheet and Collapsible components

**Files:**
- Create: `src/components/ui/sheet.tsx` (auto-generated)
- Create: `src/components/ui/collapsible.tsx` (auto-generated)

**Step 1: Add the components**

```bash
npx shadcn add sheet collapsible
```

Expected: two new files created in `src/components/ui/`.

**Step 2: Verify they render**

Check the files exist and have no TypeScript errors:
```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/ui/sheet.tsx src/components/ui/collapsible.tsx
git commit -m "chore: add Sheet and Collapsible shadcn components"
```

---

## Task 6: `SpecRow` component — collapsible spec entry

**Files:**
- Create: `src/components/projects/spec-row.tsx`

This component renders one spec (e.g. "010 — Allocation Planning") as a collapsible row showing progress and PR status.

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface PlanPhase {
  name: string;
  status: string;
  tasks: { text: string; done: boolean }[];
}

export interface Plan {
  id: string;
  title: string;
  format: string;
  filePath: string;
  phases: PlanPhase[];
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  branchRef: string;
  specNumber: string | null;
  state: string;
  mergedAt: string | null;
  htmlUrl: string;
}

export type SpecStatus = "shipped" | "in_progress" | "not_started";

export interface SpecGroup {
  specNumber: string;    // "010"
  specName: string;      // "allocation planning" (from dir name)
  plans: Plan[];
  primaryPlan: Plan | null; // the tasks.md (speckit-tasks format)
  status: SpecStatus;
  mergedAt: string | null;
  pr: PullRequest | null;
}

interface SpecRowProps {
  spec: SpecGroup;
  defaultExpanded?: boolean;
  onOpenDrawer?: (spec: SpecGroup) => void;
}

const statusConfig: Record<SpecStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  shipped: { label: "Shipped", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  not_started: { label: "Not Started", variant: "outline" },
};

export function SpecRow({ spec, defaultExpanded = false, onOpenDrawer }: SpecRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const primary = spec.primaryPlan;
  const totalTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.length, 0) ?? 0;
  const doneTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.filter((t) => t.done).length, 0) ?? 0;
  const pct = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;

  const config = statusConfig[spec.status];
  const isShipped = spec.status === "shipped";

  const supportingDocs = spec.plans.filter((p) => p.format !== "speckit-tasks");

  return (
    <div className={`border rounded-md ${isShipped ? "opacity-60" : ""}`}>
      {/* Collapsed header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">{spec.specNumber}</span>
        <span className="font-medium capitalize flex-1 truncate">{spec.specName}</span>
        <Badge variant={config.variant} className="text-xs shrink-0">{config.label}</Badge>
        {totalTasks > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{doneTasks}/{totalTasks}</span>
        )}
        {isShipped && spec.mergedAt && (
          <span className="text-xs text-muted-foreground shrink-0">{spec.mergedAt.slice(0, 10)}</span>
        )}
      </button>

      {/* Progress bar — always visible */}
      {totalTasks > 0 && (
        <div className="mx-3 mb-2 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          {/* Phases from primary plan */}
          {primary && (
            <div className="space-y-1">
              {[...primary.phases]
                .sort((a, b) => {
                  const order = { in_progress: 0, not_started: 1, completed: 2 };
                  return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
                })
                .map((phase, i) => {
                  const done = phase.tasks.filter((t) => t.done).length;
                  return (
                    <div key={i} className={`text-sm flex items-center justify-between ${phase.status === "completed" ? "text-muted-foreground" : ""}`}>
                      <span className="truncate">{phase.name}</span>
                      {phase.tasks.length > 0 && (
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{done}/{phase.tasks.length}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* PR link */}
          {spec.pr && (
            <a
              href={spec.pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              PR #{spec.pr.number}: {spec.pr.title.slice(0, 50)}
            </a>
          )}

          {/* Supporting docs */}
          {supportingDocs.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {supportingDocs.map((doc) => (
                <span key={doc.id} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                  {doc.filePath.split("/").pop()}
                </span>
              ))}
            </div>
          )}

          {/* Open drawer button */}
          {onOpenDrawer && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); onOpenDrawer(spec); }}>
              View all tasks →
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 1: Create the file with the code above**

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

**Step 3: Commit**

```bash
git add src/components/projects/spec-row.tsx
git commit -m "feat: add SpecRow collapsible component"
```

---

## Task 7: `SpecDrawer` component — full task detail in a Sheet

**Files:**
- Create: `src/components/projects/spec-drawer.tsx`

```typescript
"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { SpecGroup, SpecStatus } from "./spec-row";

interface SpecDrawerProps {
  spec: SpecGroup | null;
  onClose: () => void;
}

const statusConfig: Record<SpecStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  shipped: { label: "Shipped", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  not_started: { label: "Not Started", variant: "outline" },
};

function PhaseSection({ phase }: { phase: { name: string; status: string; tasks: { text: string; done: boolean }[] } }) {
  const [open, setOpen] = useState(phase.status !== "completed");
  const done = phase.tasks.filter((t) => t.done).length;

  return (
    <div className="border rounded-md">
      <button
        className="w-full flex items-center gap-2 p-2 text-sm text-left hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="flex-1 font-medium truncate">{phase.name}</span>
        {phase.tasks.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{done}/{phase.tasks.length}</span>
        )}
      </button>
      {open && phase.tasks.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {phase.tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-0.5">
              <span className={`shrink-0 mt-0.5 ${task.done ? "text-primary" : "text-muted-foreground"}`}>
                {task.done ? "☑" : "☐"}
              </span>
              <span className={task.done ? "text-muted-foreground line-through" : ""}>{task.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecDrawer({ spec, onClose }: SpecDrawerProps) {
  if (!spec) return null;

  const primary = spec.primaryPlan;
  const totalTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.length, 0) ?? 0;
  const doneTasks = primary?.phases.reduce((n, ph) => n + ph.tasks.filter((t) => t.done).length, 0) ?? 0;
  const config = statusConfig[spec.status];
  const supportingDocs = spec.plans.filter((p) => p.format !== "speckit-tasks");

  const sortedPhases = primary
    ? [...primary.phases].sort((a, b) => {
        const order = { in_progress: 0, not_started: 1, completed: 2 };
        return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
      })
    : [];

  return (
    <Sheet open={!!spec} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{spec.specNumber}</span>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <SheetTitle className="capitalize">{spec.specName}</SheetTitle>
          <p className="text-sm text-muted-foreground">{doneTasks} / {totalTasks} tasks complete</p>
        </SheetHeader>

        {/* PR link */}
        {spec.pr && (
          <div className="mb-4">
            <a
              href={spec.pr.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              PR #{spec.pr.number}: {spec.pr.title}
            </a>
          </div>
        )}

        {/* Phases */}
        <div className="space-y-2 mb-4">
          {sortedPhases.map((phase, i) => (
            <PhaseSection key={i} phase={phase} />
          ))}
        </div>

        {/* Supporting docs */}
        {supportingDocs.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Supporting docs</p>
            <div className="flex flex-wrap gap-1">
              {supportingDocs.map((doc) => (
                <span key={doc.id} className="text-xs bg-muted rounded px-1.5 py-0.5">
                  {doc.filePath.split("/").pop()}
                </span>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Step 1: Create the file**

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/projects/spec-drawer.tsx
git commit -m "feat: add SpecDrawer sheet component"
```

---

## Task 8: `SpecList` component — grouping logic, search, filter, stats

**Files:**
- Create: `src/components/projects/spec-list.tsx`

This is the main component. It receives `plans` and `pullRequests` as props and renders the full spec-grouped overview.

```typescript
"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpecRow, type Plan, type PullRequest, type SpecGroup, type SpecStatus } from "./spec-row";
import { SpecDrawer } from "./spec-drawer";

interface SpecListProps {
  plans: Plan[];
  pullRequests: PullRequest[];
}

// Extract spec number + name from a filePath like "specs/010-allocation-planning/tasks.md"
function parseSpecKey(filePath: string): { specNumber: string; specName: string } | null {
  const m = filePath.match(/^specs\/(\d{3})-([^/]+)\//);
  if (!m) return null;
  return { specNumber: m[1], specName: m[2].replace(/-/g, " ") };
}

function deriveStatus(spec: { plans: Plan[]; specNumber: string }, prs: PullRequest[]): SpecStatus {
  const specPrs = prs.filter((pr) => pr.specNumber === spec.specNumber);
  if (specPrs.some((pr) => pr.state === "merged")) return "shipped";
  const hasOpenPr = specPrs.some((pr) => pr.state === "open");
  const hasDoneTasks = spec.plans.some((p) =>
    p.phases.some((ph) => ph.tasks.some((t) => t.done))
  );
  if (hasOpenPr || hasDoneTasks) return "in_progress";
  return "not_started";
}

function buildSpecGroups(plans: Plan[], pullRequests: PullRequest[]): { specs: SpecGroup[]; ungrouped: Plan[] } {
  const groupMap = new Map<string, { specNumber: string; specName: string; plans: Plan[] }>();
  const ungrouped: Plan[] = [];

  for (const plan of plans) {
    const parsed = parseSpecKey(plan.filePath);
    if (parsed) {
      const existing = groupMap.get(parsed.specNumber);
      if (existing) {
        existing.plans.push(plan);
      } else {
        groupMap.set(parsed.specNumber, { ...parsed, plans: [plan] });
      }
    } else {
      ungrouped.push(plan);
    }
  }

  const specs: SpecGroup[] = Array.from(groupMap.values())
    .sort((a, b) => a.specNumber.localeCompare(b.specNumber))
    .map((group) => {
      const primaryPlan = group.plans.find((p) => p.format === "speckit-tasks") ?? null;
      const status = deriveStatus(group, pullRequests);
      const specPrs = pullRequests.filter((pr) => pr.specNumber === group.specNumber);
      const mergedPr = specPrs.find((pr) => pr.state === "merged") ?? null;
      const openPr = specPrs.find((pr) => pr.state === "open") ?? null;
      return {
        specNumber: group.specNumber,
        specName: group.specName,
        plans: group.plans,
        primaryPlan,
        status,
        mergedAt: mergedPr?.mergedAt ?? null,
        pr: mergedPr ?? openPr,
      };
    });

  return { specs, ungrouped };
}

export function SpecList({ plans, pullRequests }: SpecListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "shipped">("all");
  const [showAllShipped, setShowAllShipped] = useState(false);
  const [drawerSpec, setDrawerSpec] = useState<SpecGroup | null>(null);

  const { specs, ungrouped } = useMemo(
    () => buildSpecGroups(plans, pullRequests),
    [plans, pullRequests]
  );

  const shipped = specs.filter((s) => s.status === "shipped");
  const inProgress = specs.filter((s) => s.status === "in_progress");
  const notStarted = specs.filter((s) => s.status === "not_started");

  // Stats
  const stats = `${shipped.length} shipped · ${inProgress.length} in progress · ${notStarted.length} not started`;

  const filterSpec = (s: SpecGroup) => {
    if (search && !s.specName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "in_progress" && s.status !== "in_progress") return false;
    if (statusFilter === "shipped" && s.status !== "shipped") return false;
    return true;
  };

  const visibleShipped = showAllShipped ? shipped.filter(filterSpec) : [];

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{stats}</p>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search specs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "in_progress", "shipped"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              onClick={() => setStatusFilter(f)}
            >
              {f === "all" ? "All" : f === "in_progress" ? "In Progress" : "Shipped"}
            </Button>
          ))}
        </div>
      </div>

      {/* In Progress */}
      {inProgress.filter(filterSpec).length > 0 && statusFilter !== "shipped" && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">In Progress</h4>
          <div className="space-y-2">
            {inProgress.filter(filterSpec).map((spec) => (
              <SpecRow key={spec.specNumber} spec={spec} defaultExpanded onOpenDrawer={setDrawerSpec} />
            ))}
          </div>
        </div>
      )}

      {/* Not Started */}
      {notStarted.filter(filterSpec).length > 0 && statusFilter === "all" && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Not Started</h4>
          <div className="space-y-2">
            {notStarted.filter(filterSpec).map((spec) => (
              <SpecRow key={spec.specNumber} spec={spec} onOpenDrawer={setDrawerSpec} />
            ))}
          </div>
        </div>
      )}

      {/* Shipped */}
      {shipped.length > 0 && statusFilter !== "in_progress" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Shipped ({shipped.length})
            </h4>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAllShipped((s) => !s)}>
              {showAllShipped ? "Collapse" : "Show all"}
            </Button>
          </div>
          {showAllShipped && (
            <div className="space-y-2">
              {visibleShipped.map((spec) => (
                <SpecRow key={spec.specNumber} spec={spec} onOpenDrawer={setDrawerSpec} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ungrouped plans (README etc) */}
      {ungrouped.length > 0 && statusFilter === "all" && (
        <div className="mt-6">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Other</h4>
          <div className="space-y-1">
            {ungrouped.map((p) => (
              <div key={p.id} className="text-sm text-muted-foreground px-2">{p.title}</div>
            ))}
          </div>
        </div>
      )}

      <SpecDrawer spec={drawerSpec} onClose={() => setDrawerSpec(null)} />
    </div>
  );
}
```

**Step 1: Create the file**

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/projects/spec-list.tsx
git commit -m "feat: add SpecList component with spec grouping, search and filter"
```

---

## Task 9: Wire the project detail page to use `SpecList`

**Files:**
- Modify: `src/app/projects/[id]/page.tsx`

Replace the current `PlanProgress` usage with `SpecList`. The page now fetches both plans and pull requests.

**Step 1: Update `src/app/projects/[id]/page.tsx`**

Replace the file contents with:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecList } from "@/components/projects/spec-list";
import { ProjectActivity } from "@/components/projects/project-activity";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [project, setProject] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plans, setPlans] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prs, setPrs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [projRes, plansRes, prsRes, itemsRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/plans/${id}`),
        fetch(`/api/pull-requests?projectId=${id}`),
        fetch(`/api/attention?projectId=${id}`),
      ]);

      setProject(await projRes.json());
      setPlans(await plansRes.json());
      setPrs(await prsRes.json());
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold">{project.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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

      {/* Attention items */}
      {items.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Attention</h3>
          <ProjectActivity items={items} onResolve={handleResolve} />
        </div>
      )}

      {/* Spec list */}
      <SpecList plans={plans} pullRequests={prs} />
    </div>
  );
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Smoke test in browser**

Open `http://localhost:3000/projects/d0025b50-671d-4828-8c9f-fafd0383d5cf` (asset-portfolio).

Expected:
- Stats line shows counts
- Shipped section shows 15+ specs collapsed
- Any in-progress spec is expanded by default
- "View all tasks →" opens the drawer

**Step 4: Commit**

```bash
git add src/app/projects/[id]/page.tsx
git commit -m "feat: wire project detail page to use SpecList with PR data"
```

---

## Task 10: `ActivityFeed` component + update home page

**Files:**
- Create: `src/components/inbox/activity-feed.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create `src/components/inbox/activity-feed.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";

interface ActivityItem {
  id: string;
  number: number;
  title: string;
  specNumber: string;
  mergedAt: string;
  htmlUrl: string;
  projectId: string;
  projectName: string;
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Recently shipped</h3>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 text-sm py-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <a
              href={item.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline font-mono text-xs text-muted-foreground shrink-0"
            >
              {item.specNumber}
            </a>
            <span className="truncate">{item.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">{item.projectName}</span>
            <span className="text-xs text-muted-foreground shrink-0">{item.mergedAt.slice(0, 10)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Update `src/app/page.tsx` to include ActivityFeed**

Add `import { ActivityFeed } from "@/components/inbox/activity-feed";` at the top.

Then in the JSX, after the attention items list (inside the return, at the bottom of the main div), add:

```tsx
<ActivityFeed />
```

**Step 3: TypeScript check + smoke test**

```bash
npx tsc --noEmit
```

Open `http://localhost:3000` — expect "Recently shipped" section with spec PRs listed.

**Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all pass

**Step 5: Commit**

```bash
git add src/components/inbox/activity-feed.tsx src/app/page.tsx
git commit -m "feat: add ActivityFeed to home page showing recently shipped specs"
```

---

## Final verification

```bash
# All tests pass
npx vitest run

# No TypeScript errors
npx tsc --noEmit

# Sync to populate pull_requests table
curl -X POST http://localhost:3000/api/sync

# Check activity feed has data
curl http://localhost:3000/api/activity | python3 -m json.tool | head -20

# Check PR data for asset-portfolio
curl "http://localhost:3000/api/pull-requests?projectId=d0025b50-671d-4828-8c9f-fafd0383d5cf" | python3 -c "import json,sys; prs=json.load(sys.stdin); print(len(prs), 'PRs'); [print(f'  {p[\"state\"]:6} spec={p[\"specNumber\"]} {p[\"branchRef\"]}') for p in prs[:10]]"
```

Push and update the PR:

```bash
git push origin feature/initial-implementation
```
