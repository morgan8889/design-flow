# DesignFlow — Attention-Driven Development Workflow App

## Overview

DesignFlow is a web app that acts as an attention engine for a solo developer managing 4-8 active projects. It aggregates signals from GitHub and local repositories, parses specs/PRDs from multiple framework formats, and surfaces a prioritized inbox of items that need action. Implementation status is derived from parsed plans and shown as supporting context.

**Key decisions:**
- Web app (Next.js + TypeScript) first, Swift app later consuming the same API
- Polling-based sync (not webhooks) for simplicity and offline support
- SQLite for storage — single-user, zero infrastructure
- Adaptive spec parser with per-framework profiles
- macOS native notifications for high-priority items

## Core Data Model

### Project

A registered repository — GitHub, local, or both.

| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | Primary key |
| name | string | Repo or folder name |
| github_url | string (nullable) | Full repo URL |
| local_path | string (nullable) | Absolute path on disk |
| source | enum | `github_discovered`, `github_manual`, `local` |
| is_tracked | boolean | Whether actively monitored (default false for discovered) |
| created_at | datetime | |
| last_synced_at | datetime (nullable) | |

A project must have at least one of `github_url` or `local_path`.

### Plan

A parsed spec/PRD file from a project's `docs/plans/` directory.

| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | Primary key |
| project_id | string | FK to Project |
| file_path | string | Relative path within repo |
| title | string | Extracted from H1 or frontmatter |
| format | string | Detected framework: superpowers, openspec, speckit, bmad, generic-markdown |
| phases | JSON | Array of phase objects |
| file_hash | string | SHA-256 for change detection |
| parsed_at | datetime | |

Each phase object:
```json
{
  "name": "Phase 1: Design",
  "status": "in_progress",
  "tasks": [
    { "text": "Create wireframes", "done": true },
    { "text": "Review with team", "done": false }
  ]
}
```

Phase status is derived: all tasks done = completed, some = in_progress, none = not_started.

### AttentionItem

Something that needs the user's attention.

| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | Primary key |
| project_id | string | FK to Project |
| plan_id | string (nullable) | FK to Plan, if plan-related |
| type | enum | See types below |
| title | string | Short summary |
| detail | string (nullable) | Additional context |
| priority | integer (1-5) | Higher = more urgent |
| source_url | string (nullable) | Link to GitHub PR, etc. |
| created_at | datetime | |
| resolved_at | datetime (nullable) | Null = active |

## Attention Engine

### Item Types and Sources

| Type | Source | Auto-resolves when |
|------|--------|-------------------|
| pr_needs_review | GitHub: PR assigned/requested | PR merged, closed, or review submitted |
| checks_failing | GitHub: commit status/checks | Checks pass on latest commit |
| pr_merge_ready | GitHub: approved + checks pass | PR merged |
| plan_changed | Sync: file hash diff | User dismisses (acknowledged) |
| phase_blocked | Sync: no task progress for N days | A task gets checked off |
| new_project | GitHub: new repo appears | User tracks or dismisses |
| stale_project | Sync: no activity for 7+ days | Any git activity resumes |

### Priority Scoring

- **5**: Action required now — checks failing on open PR, merge conflicts
- **4**: You're the blocker — PR awaiting your review, phase stalled on your task
- **3**: Ready to advance — PR merge-ready, phase fully complete
- **2**: Informational shift — plan restructured, new phase added
- **1**: Awareness — new repo discovered, low-activity project

### Inbox Behavior

- Default sort: priority descending, then recency
- Dismissed items are marked resolved with timestamp, don't recur unless condition recurs
- Auto-resolved items disappear silently
- "Resolved" tab available for reviewing recently cleared items

## Architecture

### Frontend (React, App Router)

**Inbox view (default screen):**
- Prioritized list of attention items grouped by project
- Filterable by type (PR, checks, plan change, manual)
- Items are dismissable or link out to GitHub/Figma/etc.

**Project detail view:**
- Left panel: plan progress — phases listed vertically with task completion counts, current phase highlighted, completed phases collapsed
- Right panel: active attention items, recent activity feed (commits, PR events, plan changes), outbound links
- Top header: project name, repo link, local path, overall status badge, quick actions (open in GitHub, open in terminal, trigger sync, add manual reminder)
- Multiple plan files shown as separate tracks if present

**Projects list view:**
- Cards showing: name, status badge, attention count, current phase, last activity
- Sortable by attention count, last activity, name
- Filterable by status: all, needs attention, on track, stale

**Settings view:**
- GitHub connection (PAT)
- Notification preferences and priority threshold
- Sync interval configuration
- Tracked repo management (pick list)

### API Layer (Next.js API Routes)

- `GET /api/projects` — list all projects (tracked and discovered)
- `POST /api/projects` — add a local project
- `PATCH /api/projects/:id` — toggle tracking, update config
- `GET /api/attention` — fetch attention items with filters
- `POST /api/attention/:id/resolve` — dismiss an item
- `GET /api/plans/:projectId` — parsed plans for a project
- `POST /api/sync` — trigger manual sync

Clean REST so the future Swift app consumes the same endpoints.

### Sync Engine

Runs on a configurable interval (default: 3 minutes).

For each tracked project:
1. **GitHub poller**: fetches open PRs, check statuses, `docs/plans/` file contents via GitHub API
2. **Local poller**: reads `docs/plans/` from disk, computes file hashes
3. **PRD parser**: auto-detects format, extracts phases/tasks, diffs against stored state
4. **Attention generator**: compares new vs. old state, creates/resolves attention items

GitHub rate limit budget: 8 projects x 3 calls x 20 syncs/hour = ~480 req/hour (limit is 5,000). Uses conditional requests (ETags) to minimize consumption.

### Storage

SQLite via `better-sqlite3` or Drizzle ORM. Single file, zero config.

## Adaptive Spec Parser

### Format Profiles

Each framework has a profile — a TypeScript module exporting:
- `detect(content: string): boolean` — identifies the format
- `parse(content: string): ParsedPlan` — extracts phases and tasks

Shipped profiles:
- `superpowers` — SuperPowers output conventions
- `openspec` — OpenSpec structure
- `speckit` — SpecKit format
- `bmad` — BMAD output
- `generic-markdown` — fallback for LLM-generated or freeform specs (H2 headings as phases, checklists as tasks)

### Auto-Detection Flow

1. Check frontmatter for `framework:` or `generator:` field — direct match
2. Scan structure for signature patterns (heading hierarchies, known section names) — pattern match
3. Fall back to `generic-markdown` — best-effort extraction

### Change Detection

- File hash (SHA-256) compared on each sync
- If hash changed, re-parse and diff:
  - New phases added — attention item: "New phase added to [Plan]"
  - Phases removed or reordered — attention item: "Plan restructured for [Project]"
  - Tasks added/removed within a phase — update counts silently unless completed tasks were removed

Adding a new format = adding one profile file, no core changes.

## GitHub Integration

### Authentication

Personal Access Token (classic or fine-grained) stored encrypted in SQLite. Required scope: `repo` (read access).

### Sync Cycle

1. `GET /user/repos` — refresh full repo list, surface new repos as attention items
2. Per tracked project:
   - `GET /repos/:owner/:repo/pulls?state=open` — open PRs, review status
   - `GET /repos/:owner/:repo/commits/:sha/check-runs` — CI status
   - `GET /repos/:owner/:repo/contents/docs/plans` — spec files, fetch if hash changed
3. Diff fetched state against stored, generate/resolve attention items
4. Local repos: read `docs/plans/` from disk directly

### Offline Behavior

- Local repos sync normally if GitHub is unreachable
- GitHub data uses last-known state until connectivity returns
- Single "GitHub unreachable" attention item, auto-resolves on reconnection

## Notifications

### macOS (via node-notifier)

- Fires for priority 4-5 items only
- Includes: project name, item type, one-line summary
- Clicking opens the web app to the relevant project
- Configurable: disable entirely or adjust priority threshold

### Browser (Web Notification API)

- Secondary channel when browser tab is open
- Same priority filtering

## Out of Scope

- Figma/Stitch API integration (link-only, stored as project metadata)
- Devcontainer management (app tracks status, doesn't manage environments)
- LLM calls for spec generation (app reads specs, doesn't write them)
- Multi-user support (single-user, local-first)

## Future: Swift App

- Consumes the same REST API — Next.js server continues running locally
- Native push notifications from the same attention items
- No backend changes needed — additive frontend only
