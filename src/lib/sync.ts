import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createAttentionItem, autoResolveByCondition } from "./attention";
import { detectAndParse } from "./parsers";
import { shouldNotify, formatNotification, sendMacNotification } from "./notifications";
import { createHash } from "crypto";
import type { GitHubClient } from "./github";
import { v4 as uuid } from "uuid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function extractSpecNumber(branchRef: string): string | null {
  const m = branchRef.match(/\b(\d{3})-/);
  return m ? m[1] : null;
}

function extractOwnerRepo(githubUrl: string): { owner: string; repo: string } | null {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function getNotificationThreshold(db: Db): number {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, "notification_priority_threshold")).get();
  return row ? parseInt(row.value, 10) : 4;
}

function maybeNotify(db: Db, item: { createdAt: string; priority: number; title: string }, projectName: string): void {
  const ageMs = Date.now() - new Date(item.createdAt).getTime();
  if (ageMs > 5000) return; // not newly created (dedup return)
  const threshold = getNotificationThreshold(db);
  if (shouldNotify(item, threshold)) {
    const { title, message } = formatNotification({ type: "", title: item.title, projectName });
    sendMacNotification(title, message);
  }
}

export async function syncProject(db: Db, projectId: string, github: GitHubClient): Promise<void> {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
  if (!project || !project.isTracked) return;

  if (project.githubUrl) {
    const parsed = extractOwnerRepo(project.githubUrl);
    if (parsed) {
      await syncGitHubPRs(db, project, parsed.owner, parsed.repo, github);
      await syncGitHubPlans(db, project, parsed.owner, parsed.repo, github);
    }
  }

  db.update(schema.projects)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, projectId))
    .run();
}

async function syncGitHubPRs(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (pr.requestedReviewers.length > 0) {
      hasReviewRequests = true;
      const item = createAttentionItem(db, {
        projectId: project.id,
        type: "pr_needs_review",
        title: `PR #${pr.number}: ${pr.title}`,
        priority: 4,
        sourceUrl: pr.htmlUrl,
      });
      maybeNotify(db, item, project.name);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((pr as any).headSha) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checks = await github.getCheckRuns(owner, repo, (pr as any).headSha);
      const hasFailing = checks.some(
        (c) => c.status === "completed" && c.conclusion === "failure"
      );

      if (hasFailing) {
        hasFailingChecks = true;
        const item = createAttentionItem(db, {
          projectId: project.id,
          type: "checks_failing",
          title: `Checks failing on PR #${pr.number}: ${pr.title}`,
          priority: 5,
          sourceUrl: pr.htmlUrl,
        });
        maybeNotify(db, item, project.name);
      }

      const allPassing =
        checks.length > 0 &&
        checks.every((c) => c.status === "completed" && c.conclusion === "success");
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

  if (!hasFailingChecks) {
    autoResolveByCondition(db, project.id, "checks_failing");
  }
  if (!hasReviewRequests) {
    autoResolveByCondition(db, project.id, "pr_needs_review");
  }
  if (prs.length === 0) {
    autoResolveByCondition(db, project.id, "pr_merge_ready");
  }

  // Upsert all PRs (open + closed/merged) into pull_requests table
  const mergedPRs = await github.listMergedPRs(owner, repo);
  const allPRs = [...mergedPRs];
  for (const pr of prs) {
    // Only add open PRs that weren't already returned by listMergedPRs
    if (!allPRs.some((p) => p.number === pr.number)) {
      allPRs.push({
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.htmlUrl,
        headRef: "",
        state: "open",
        mergedAt: null,
      });
    }
  }

  for (const pr of allPRs) {
    const id = `${project.id}:${pr.number}`;
    const specNumber = pr.headRef ? extractSpecNumber(pr.headRef) : null;
    const existing = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (existing) {
      db.update(schema.pullRequests)
        .set({ title: pr.title, state: pr.state, mergedAt: pr.mergedAt ?? null })
        .where(eq(schema.pullRequests.id, id))
        .run();
    } else {
      db.insert(schema.pullRequests).values({
        id,
        projectId: project.id,
        number: pr.number,
        title: pr.title,
        branchRef: pr.headRef,
        specNumber,
        state: pr.state,
        mergedAt: pr.mergedAt ?? null,
        htmlUrl: pr.htmlUrl,
      }).run();
    }
  }
}

async function collectPlanFiles(owner: string, repo: string, github: GitHubClient): Promise<string[]> {
  const files: string[] = [];

  // 1. docs/plans (flat, existing convention)
  const docsFiles = await github.listDirectoryContents(owner, repo, "docs/plans");
  files.push(...docsFiles);

  // 2. specs/ (recursive — speckit projects)
  const specFiles = await github.listFilesRecursively(owner, repo, "specs");
  files.push(...specFiles);

  // 3. README.md (project-level roadmap)
  const readme = await github.getFileContent(owner, repo, "README.md");
  if (readme) files.push("README.md");

  return [...new Set(files)].filter((f) => f.endsWith(".md"));
}

async function syncGitHubPlans(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: any,
  owner: string,
  repo: string,
  github: GitHubClient
): Promise<void> {
  const files = await collectPlanFiles(owner, repo, github);

  for (const filePath of files) {
    const fileData = await github.getFileContent(owner, repo, filePath);
    if (!fileData) continue;

    const newHash = hashContent(fileData.content);
    const existingPlan = db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.filePath, filePath), eq(schema.plans.projectId, project.id)))
      .get();

    if (existingPlan && existingPlan.fileHash === newHash) {
      continue;
    }

    const parsed = detectAndParse(fileData.content);
    if (!parsed) continue;

    if (existingPlan) {
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

      const item = createAttentionItem(db, {
        projectId: project.id,
        planId: existingPlan.id,
        type: "plan_changed",
        title: `Plan updated: ${parsed.title}`,
        priority: 2,
      });
      maybeNotify(db, item, project.name);
    } else {
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
