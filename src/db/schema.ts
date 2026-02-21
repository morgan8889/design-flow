import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  githubUrl: text("github_url"),
  localPath: text("local_path"),
  source: text("source", {
    enum: ["github_discovered", "github_manual", "local"],
  }).notNull(),
  isTracked: integer("is_tracked", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastSyncedAt: text("last_synced_at"),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  title: text("title").notNull(),
  format: text("format").notNull(),
  phases: text("phases", { mode: "json" }).notNull(),
  fileHash: text("file_hash").notNull(),
  parsedAt: text("parsed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const attentionItems = sqliteTable("attention_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => plans.id, {
    onDelete: "set null",
  }),
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
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  resolvedAt: text("resolved_at"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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
