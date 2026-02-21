# Design: Plan Overview Redesign with PR Integration

**Date:** 2026-02-21
**Status:** Approved

## Problem

The project detail page renders all plans as a flat list — 51 items for asset-portfolio alone. Each item expands all phases simultaneously. There is no concept of shipping status, no grouping by feature, and merged PRs are not surfaced anywhere in the UI.

## Goals

1. Readable plan overview using spec-grouped collapsed sections
2. Shipped status derived from merged PRs (not just task completion)
3. Activity feed showing recently shipped features across all projects
4. Spec detail drawer with full phase/task view and PR link
5. Search and status filter on the spec list

---

## Data Layer

### New `pull_requests` table

```sql
id          text PRIMARY KEY
project_id  text NOT NULL  -- FK → projects
number      integer NOT NULL
title       text NOT NULL
branch_ref  text NOT NULL   -- e.g. "016-portfolio-management"
spec_number text            -- extracted by regex \b(\d{3})- from branch_ref; null if no match
state       text NOT NULL   -- "open" | "merged" | "closed"
merged_at   text            -- ISO 8601, null if not merged
html_url    text NOT NULL
```

### Sync changes (`src/lib/sync.ts`)

`syncGitHubPRs` currently fetches only open PRs. It will additionally fetch the last 100 closed PRs (one extra API call using `state=closed&per_page=100`). All PRs are upserted into `pull_requests`.

Spec number extraction:

```typescript
function extractSpecNumber(branchRef: string): string | null {
  const m = branchRef.match(/\b(\d{3})-/);
  return m ? m[1] : null;
}
```

### New API endpoint

`GET /api/pull-requests?projectId=<id>` — returns all stored PRs for a project, ordered by `merged_at` desc.

`GET /api/activity` — returns merged PRs with `spec_number IS NOT NULL` across all tracked projects, last 20, ordered by `merged_at` desc. Joins to `projects` for project name.

---

## Frontend

### Project Detail Page (`/projects/[id]`)

Replaces the current two-column "Plan Progress + Attention" layout.

**Page structure:**

```
Header: project name, GitHub link, Sync button
Stats bar: "X specs shipped  •  Y in progress  •  Z not started  •  N attention items"

Attention section (if any items exist)
  AttentionItemCard per item

Search bar + status filter (All / In Progress / Shipped)

IN PROGRESS section — specs with status "in_progress", expanded by default
  SpecRow (expanded)

NOT STARTED section — specs with status "not_started"
  SpecRow (collapsed by default)

SHIPPED section — specs with status "shipped", collapsed
  SpecRow (collapsed, greyed out)
```

**Spec grouping logic:**

Extract the spec prefix from `filePath`: `specs/NNN-feature-name/` → key `"NNN"`. Group all plans with that prefix. The primary plan is the `tasks.md` (format = `speckit-tasks`); supporting docs are listed inside but not shown by default.

Plans at the root (e.g. `README.md`) are shown as a standalone row, ungrouped.

**Spec status rules:**

| Condition | Status |
|---|---|
| Merged PR with matching `spec_number` | `shipped` |
| Open PR with matching `spec_number`, OR any tasks done | `in_progress` |
| Zero tasks done, no PR | `not_started` |

Shipped takes precedence over task-derived status.

**SpecRow component:**

- Collapsed: spec number + name, status badge, progress bar (done/total from tasks.md), merged date (if shipped)
- Expanded: phase list (in_progress phases first, completed phases collapsed), supporting doc links, PR badge with link
- Click anywhere on row to toggle expand/collapse

**Shipped rows** are `opacity-60` and start collapsed. The entire shipped section starts collapsed behind a "Show all (N)" toggle.

### Spec Detail Drawer

`Sheet` component (right-side panel, ~480px wide) opened by clicking an expand icon on a SpecRow.

Contents:
- Header: spec number + name, status badge, task count
- PR link (if any)
- Phase accordion: phases sorted in_progress → not_started → completed; completed phases start collapsed
- Each phase: read-only task checklist (☑ / ☐)
- Footer: supporting docs as links

### Activity Feed (Home/Inbox page)

New "Recently shipped" section below attention items on the home page (`/`).

Fetches from `GET /api/activity`. Renders a simple timeline list:

```
✓ 016 Portfolio Management     asset-portfolio    2026-02-04
✓ 015 Transaction Pagination   asset-portfolio    2026-02-03
```

Limited to 20 entries. Shows only spec-mapped merged PRs (ignores fix/cleanup PRs).

### Search & Filter

Client-side. The search input filters specs by name substring. The status filter ("All / In Progress / Shipped") toggles visibility of shipped section or narrows results.

---

## Components

| Component | Location | Description |
|---|---|---|
| `SpecRow` | `components/projects/spec-row.tsx` | Collapsible spec entry with progress bar |
| `SpecDrawer` | `components/projects/spec-drawer.tsx` | Right-side Sheet with full phase/task view |
| `SpecList` | `components/projects/spec-list.tsx` | Grouped list with search/filter, replaces `PlanProgress` |
| `ProjectStatsBar` | `components/projects/project-stats-bar.tsx` | Inline stats row |
| `ActivityFeed` | `components/inbox/activity-feed.tsx` | Recently shipped list for home page |

---

## Migration

Add `pull_requests` table via a new Drizzle migration. No changes to existing tables.

---

## Out of Scope

- Editing plans from the UI
- Pushing task state back to GitHub
- Notifications for newly shipped specs
